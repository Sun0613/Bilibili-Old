/**
 * @module xhrhook
 * @description xhrhook模块，拦截修改XMLHttpRequest
 * @license MIT
 */
(function () {
    const BLOD = window.BLOD; // 模块上下文，由主模块定义
    const config = BLOD.config; // 脚本设置
    const xhr = BLOD.xhr; // XMLHttpRequest
    const toast = BLOD.toast; // Toastr
    const debug = BLOD.debug; // 调试信息

    const openArray = [], jsonpArray = [];

    /**
     * @class Xhrhook
     * @description xhrhook
     */
    class Xhrhook {
        constructor() {
            BLOD.xhrhook = (callback) => this.xhrhook(callback); // 暴露xhrhook接口
            BLOD.quitXhrhook = (id) => this.quitXhrhook(id); // 暴露xhrhook 取消接口
            BLOD.jsonphook = (calllback) => this.jsonphook(calllback); // 暴露jsonphook接口
            BLOD.quitJsonphook = (id) => this.quitJsonphook(id); // 暴露jsonphook 取消接口

            if (config.reset.livechat) BLOD.joinNormal(() => this.webSocket()); // 启动webSocket hook
            if (config.reset.danmuku && Worker) BLOD.joinNormal(() => this.worker()); // 启动worker hook
            BLOD.joinNormal(() => this.open()); // 启动open hook
            BLOD.joinNormal(() => { if (window.$ && window.$.ajaxSetup) this.jsonp() }); // 启动jsonp hook
            BLOD.joinNormal(() => this.sendBeacon()); // 拦截日志上报 sendBeacon的部分
            BLOD.xhrhook((xhr, args) => {
                let obj = BLOD.urlObj(args[1]) // 转化URL为对象方便处理
                // 拦截日志上报 xhr的部分
                if (args[1].includes("data.bilibili.com") || args[1].includes("data.bilivideo.com")) xhr.send = () => true;
                // 保护视频心跳
                if (args[1].includes('api.bilibili.com/x/report/web/heartbeat')) {
                    if (config.reset.heartbeat) {
                        args[1] = args[1].replace('api.bilibili.com/x/report/web/heartbeat', 'api.bilibili.com/x/click-interface/web/heartbeat');
                    }
                    if (BLOD.vip) xhr.send = () => true;
                }
                if (config.reset.carousel && args[1].includes('api.bilibili.com/x/player/carousel')) {
                    // 修复播放器通知
                    xhr.addEventListener('readystatechange', () => {
                        if (xhr.readyState === 4) {
                            try {
                                let fix = BLOD.randomArray(JSON.parse(BLOD.GM.getResourceText("icon")).fix, 2);
                                let msg = [];
                                fix.forEach(d => {
                                    msg.push([d.links[0], d.title]);
                                })
                                let xmltext = '<msg><item tooltip="" bgcolor="#000000" catalog="system" resourceid="2319" srcid="2320" id="314825"><![CDATA[<a href="' + msg[0][0] + '" target="_blank"><font color="#FFFFFF">' + msg[0][1] + '</font></a>]]></item><item tooltip="" bgcolor="#000000" catalog="system" resourceid="2319" srcid="2321" id="314372"><![CDATA[<a href="' + msg[1][0] + '" target="_blank"><font color="#FFFFFF">' + msg[1][1] + '</font></a>]]></item></msg>';
                                let parser = new DOMParser(),
                                    responseXML = parser.parseFromString(xmltext, "text/xml");
                                Object.defineProperty(xhr, 'responseXML', { writable: true });
                                xhr.responseXML = responseXML;
                            } catch (e) { e = Array.isArray(e) ? e : [e]; toast.error("播放通知", ...e) }
                        }
                    });
                }
                // 修改区域限制
                if (args[1].includes('season/user/status?')) {
                    xhr.addEventListener('readystatechange', () => {
                        if (xhr.readyState === 4) {
                            try {
                                let response = BLOD.jsonCheck(xhr.responseText);
                                if (response.result) {
                                    if (config.reset.limit && response.result.area_limit) {
                                        response.result.area_limit = 0;
                                        response.ban_area_show = 1;
                                        BLOD.limit = true;
                                    }
                                    if (response.result.pay) BLOD.big = 0;
                                    if (!response.result.pay && BLOD.big && response.result.dialog) {
                                        response.result.pay = 1;
                                        BLOD.vip = true;
                                    }
                                    if (response.result.progress) response.result.watch_progress = response.result.progress;
                                    if (response.result.vip_info) response.result.vipInfo = response.result.vip_info;
                                    Object.defineProperty(xhr, 'response', { writable: true });
                                    Object.defineProperty(xhr, 'responseText', { writable: true });
                                    xhr.response = xhr.responseText = JSON.stringify(response);
                                }
                            } catch (e) { e = Array.isArray(e) ? e : [e]; debug.error("强制启用播放器", ...e) }
                        }
                    });
                    args[1] = args[1].replace('bangumi.bilibili.com/view/web_api/season/user/status', 'api.bilibili.com/pgc/view/web/season/user/status');
                }
                // 禁用防挡字幕
                if (!BLOD.preventshade && args[1].includes('api.bilibili.com/x/player.so')) {
                    xhr.addEventListener('readystatechange', () => {
                        if (xhr.readyState === 4) {
                            let response = xhr.responseText;
                            if (response.includes("<bottom>1</bottom>")) {
                                response = response.replace("<bottom>1</bottom>", "<bottom>0</bottom>");
                                Object.defineProperty(xhr, 'response', { writable: true });
                                Object.defineProperty(xhr, 'responseText', { writable: true });
                                xhr.response = xhr.responseText = response;
                            }
                        }
                    });
                }
                // // 动态跳转向相簿
                // if (args[1].includes('api.vc.bilibili.com/dynamic_svr/v1/dynamic_svr/get_dynamic_detail')) {
                //     xhr.addEventListener('readystatechange', () => {
                //         if (xhr.readyState === 4) {
                //             let response = JSON.parse(xhr.responseText);
                //             location.href = `https://h.bilibili.com/${response.data.card.desc.rid_str}`;
                //         }
                //     });
                // }
                // 监听视频链接
                if (args[1].includes("/playurl?")) {
                    if (!obj.sign) {
                        obj.fourk = 1; // 添加4K支持
                        obj.fnval = obj.fnval ? 80 : null; // 添加HDR支持
                        if (config.reset.forceFlv) {
                            obj.fnval = null; // 强行载入flv
                            obj.fnver = null;
                        }
                    }
                    BLOD.cid = obj.cid || BLOD.cid; // 记录cid
                    BLOD.aid = obj.avid || BLOD.aid || null; // 记录aid
                    BLOD.bvid = obj.bvid || (BLOD.aid && BLOD.abv(BLOD.aid)) || BLOD.bvid || null; // 记录bvid
                    if (config.reset.novideo && !obj.sign) obj = Object.assign(obj, { aid: 1, cid: 1, ep_id: 1 }); // 拦截视频
                    args[1] = BLOD.objUrl(args[1].split("?")[0], obj); // 重构修改过的URL
                    args[1] = args[1].includes("84956560bc028eb7") ? BLOD.urlSign(args[1], 0, 8) : args[1]; // 替换失效key
                    BLOD.pgc = args[1].includes("pgc") ? true : false; // 记录视频类型为Bangumi
                    if (BLOD.pgc && !BLOD.limit && BLOD.__INITIAL_STATE__ && BLOD.__INITIAL_STATE__.rightsInfo && BLOD.__INITIAL_STATE__.rightsInfo.watch_platform) xhr.send = () => BLOD.playLimit.mobile(xhr, args[1]); // 处理APP限制视频
                    BLOD.vip = BLOD.big > 1 ? true : BLOD.vip; // 记录特殊视频
                    if (BLOD.big > 1 || (BLOD.vip && BLOD.ids.indexOf(1 * BLOD.cid) >= 0)) xhr.send = async () => BLOD.playLimit.bigvip(xhr, args[1]); // 处理特殊视频
                    if (BLOD.limit) xhr.send = async () => BLOD.playLimit.area(xhr, args[1]);   // 处理区域限制视频
                    xhr.addEventListener('readystatechange', async () => {
                        // 记录视频给下载面板
                        if (xhr.readyState === 4) {
                            try {
                                if (!xhr.response) throw xhr;
                                BLOD.__playinfo__ = typeof xhr.response == "object" ? xhr.response : BLOD.jsonCheck(xhr.response);
                                // 移除下载面板
                                if (document.getElementById("bili-old-download-table")) document.getElementById("bili-old-download-table").remove();
                            } catch (e) { e = Array.isArray(e) ? e : [e]; debug.error("视频监听", ...e) }
                        }
                    });
                }
                // 监听页面多次重写jsonp
                if (window.$ && (this.$ != window.$)) { this.jsonp(); this.$ = window.$; }
            });
            BLOD.jsonphook((xhr, jsonp) => {
                // 清除远古动态
                if (jsonp.url.includes("api.bilibili.com/x/web-feed/feed/unread")) jsonp.url = jsonp.url.replace("feed/unread", "article/unread");
                // 修复评论楼层并修复mode返回值
                if (jsonp.url.includes('api.bilibili.com/x/v2/reply?') && jsonp.url.includes('oid') && !jsonp.url.includes('android')) {
                    jsonp.url = jsonp.url + '&mobi_app=android';
                    let jsonpCallback = jsonp.jsonpCallback;
                    let call = window[jsonpCallback];
                    if (call) {
                        window[jsonpCallback] = function (v) {
                            if (v && v.data && v.data.replies && v.data.mode === 1) v.data.mode = 3;
                            if (v && v.data && v.data.upper && v.data.upper.top && v.data.upper.top.replies) BLOD.topReply = v.data.upper.top.replies;
                            if (BLOD.topReply && v.data && v.data.upper && v.data.upper.top && !v.data.upper.top.replies) v.data.upper.top.replies = BLOD.topReply;
                            BLOD.replyFloor(v);
                            return call.call(jsonp, v);
                        }
                    }
                }
                // 替换旧版顶栏动图彩蛋
                if (config.reset.indexIcon && jsonp.url.includes("api.bilibili.com/x/web-interface/index/icon")) {
                    let jsonpCallback = jsonp.jsonpCallback;
                    let call = window[jsonpCallback];
                    if (call) {
                        window[jsonpCallback] = function (v) {
                            v.data = BLOD.randomArray(JSON.parse(BLOD.GM.getResourceText("icon")).fix, 1)[0];
                            return call.call(jsonp, v);
                        }
                    }
                }
                if (jsonp.url.includes("api.bilibili.com/x/web-show/res/locs") && jsonp.url.includes("ids=142")) {
                    let jsonpCallback = jsonp.jsonpCallback;
                    let call = window[jsonpCallback];
                    if (call) {
                        window[jsonpCallback] = function (v) {
                            v.data[142][0].pic = BLOD.randomArray([
                                "//i0.hdslb.com/bfs/activity-plat/static/20171220/68a052f664e8414bb594f9b00b176599/images/90w1lpp6ry.png",
                                "//i0.hdslb.com/bfs/archive/b60151347754f0089489d7d68271233960a8d52f.png"
                            ], 1)[0];
                            return call.call(jsonp, v);
                        }
                    }
                }
            })
        }
        /**
         * hook webSocket
         */
        webSocket() {
            let decoder = new TextDecoder();
            let encoder = new TextEncoder();
            let liveChatOld; // 对旧播放器建立的ws对象的引用
            let liveChat;
            // 为了获取ws对象的引用,hook WebSocket.send
            let wsHookRunOnce = true;
            const wssend = WebSocket.prototype.send;

            WebSocket.prototype.send = function (...arg) {
                if (wsHookRunOnce && this.url == 'wss://broadcast.chat.bilibili.com:4095/sub') {
                    liveChatOld = this;
                    // 切p和掉线之后需要重新启动hook,获得新的引用
                    let onclose = liveChatOld.onclose;
                    liveChatOld.onclose = function () {
                        wsHookRunOnce = true;
                        clearTimeout(liveChat.heatTimer);
                        liveChat.close();
                        onclose.call(this);
                    }
                    // 从bilibiliPlayer.js > b.prototype.xx复制过来
                    // 编码一个数据包
                    // body[Object] : 要发送的信息
                    // option[Number] : 数据包对应的行为
                    //                  =5 一条弹幕数据
                    //                  =7 首个数据包,建立与服务器的连接
                    // return[Buffer] : 包装好的数据
                    liveChatOld.convertToArrayBuffer = function (body, option) {
                        let header = [{ "name": "Header Length", "key": "headerLen", "qg": 2, "offset": 4, "value": 16 }, { "name": "Protocol Version", "key": "ver", "qg": 2, "offset": 6, "value": 1 }, { "name": "Operation", "key": "op", "qg": 4, "offset": 8, "value": option }, { "name": "Sequence Id", "key": "seq", "qg": 4, "offset": 12, "value": 1 }];
                        let headerBuf = new ArrayBuffer(16);
                        let viewer = new DataView(headerBuf, 0);
                        let bodyBuf = encoder.encode(JSON.stringify(body));
                        viewer.setInt32(0, 16 + bodyBuf.byteLength);
                        header.forEach(function (b) {
                            4 === b.qg ? viewer.setInt32(b.offset, b.value) : 2 === b.qg && viewer.setInt16(b.offset, b.value)
                        })
                        return mergeArrayBuffer(headerBuf, bodyBuf);
                    }
                    wsHookRunOnce = false;
                    initLiveChat();
                }
                wssend.call(this, ...arg);
            }

            // 原函数位于bilibiliPlayer.js > c.a.eK 和 jsc-player > Dl.mergeArrayBuffer
            // 连接两个buffer
            function mergeArrayBuffer(headerBuf, bodyBuf) {
                headerBuf = new Uint8Array(headerBuf);
                bodyBuf = new Uint8Array(bodyBuf);
                var d = new Uint8Array(headerBuf.byteLength + bodyBuf.byteLength);
                d.set(headerBuf, 0);
                d.set(bodyBuf, headerBuf.byteLength);
                return d.buffer;
            }

            function initLiveChat() {
                // 数据包对应的Operation常量表
                let Pl = { "WS_OP_HEARTBEAT": 2, "WS_OP_HEARTBEAT_REPLY": 3, "WS_OP_DATA": 1000, "WS_OP_BATCH_DATA": 9, "WS_OP_DISCONNECT_REPLY": 6, "WS_OP_USER_AUTHENTICATION": 7, "WS_OP_CONNECT_SUCCESS": 8, "WS_OP_CHANGEROOM": 12, "WS_OP_CHANGEROOM_REPLY": 13, "WS_OP_REGISTER": 14, "WS_OP_REGISTER_REPLY": 15, "WS_OP_UNREGISTER": 16, "WS_OP_UNREGISTER_REPLY": 17, "WS_OP_OGVCMD_REPLY": 1015, "WS_PACKAGE_HEADER_TOTAL_LENGTH": 18, "WS_PACKAGE_OFFSET": 0, "WS_HEADER_OFFSET": 4, "WS_VERSION_OFFSET": 6, "WS_OPERATION_OFFSET": 8, "WS_SEQUENCE_OFFSET": 12, "WS_COMPRESS_OFFSET": 16, "WS_CONTENTTYPE_OFFSET": 17, "WS_BODY_PROTOCOL_VERSION": 1, "WS_HEADER_DEFAULT_VERSION": 1, "WS_HEADER_DEFAULT_OPERATION": 1, "ws_header_default_sequence": 1, "WS_HEADER_DEFAULT_COMPRESS": 0, "WS_HEADER_DEFAULT_CONTENTTYPE": 0 };
                // 请求头的参数表
                let wsBinaryHeaderList = [{ "name": "Header Length", "key": "headerLen", "bytes": 2, "offset": 4, "value": 18 }, { "name": "Protocol Version", "key": "ver", "bytes": 2, "offset": 6, "value": 1 }, { "name": "Operation", "key": "op", "bytes": 4, "offset": 8, "value": 7 }, { "name": "Sequence Id", "key": "seq", "bytes": 4, "offset": 12, "value": 2 }, { "name": "Compress", "key": "compress", "bytes": 1, "offset": 16, "value": 0 }, { "name": "ContentType", "key": "contentType", "bytes": 1, "offset": 17, "value": 0 }]
                liveChat = new WebSocket('wss://broadcast.chat.bilibili.com:7823/sub');
                liveChat.binaryType = "arraybuffer";
                liveChat.heatTimer = -1;

                // 每30秒一个心跳包
                liveChat.heartBeat = function () {
                    var i = this;
                    clearTimeout(this.heatTimer);
                    var e = this.convertToArrayBuffer({}, Pl.WS_OP_HEARTBEAT);
                    this.send(e);
                    this.heatTimer = window.setTimeout((function () {
                        i.heartBeat();
                    }), 1e3 * 30);
                }

                liveChat.onopen = function () {
                    let body = {
                        "room_id": "video://" + BLOD.aid + "/" + BLOD.cid,
                        "platform": "web",
                        "accepts": [1000, 1015]
                    };
                    return this.send(this.convertToArrayBuffer(body, 7));
                }

                liveChat.onmessage = function (i) {
                    try {
                        var t = this.convertToObject(i.data);
                        if (t) {
                            switch (t.op) {
                                case Pl.WS_OP_HEARTBEAT_REPLY:
                                    // 接收到心跳包后,服务器响应当前在线人数的数据
                                    // 旧播放器连接的4095端口,虽然不再下发实时弹幕,但依然照常响应在线人数
                                    // 所以暂时不用替换成新版
                                    // this.onHeartBeatReply(t.body);
                                    break;
                                case Pl.WS_OP_CONNECT_SUCCESS:
                                    this.heartBeat();
                                    break;
                                // 旧播放器只能处理(连接成功，心跳响应，实时弹幕)三种响应信息
                                // 新播放器新增的指令和功能就不管了
                                case Pl.WS_OP_CHANGEROOM_REPLY:
                                    //0 === Number(t.body.code) && this.options.onChangeRoomReply({data : t && t.body });
                                    break;
                                case Pl.WS_OP_REGISTER_REPLY:
                                    //0 === Number(t.body.code) && this.options.onRegisterReply({data : t && t.body });
                                    break;
                                case Pl.WS_OP_UNREGISTER_REPLY:
                                    //0 === Number(t.body.code) && this.options.onUnRegisterReply({data : t && t.body });
                                    break;
                                case Pl.WS_OP_DATA:
                                case Pl.WS_OP_BATCH_DATA:
                                    t.body.forEach(function (v) {
                                        liveChatOld.onmessage({
                                            data: liveChatOld.convertToArrayBuffer({
                                                cmd: 'DM',
                                                info: [v[0], v[1]]
                                            }, 5)
                                        });
                                    });
                                    break;
                                case Pl.WS_OP_OGVCMD_REPLY:
                                    //this.onOgvCmdReply(t);
                                    break;
                                default:
                                //this.msgReply(t)
                            }
                        }
                    } catch (i) {
                        console.error("WebSocket Error : ", i)
                    }
                    return this;
                }

                // jsc-player > i.prototype.convertToArrayBuffer,新版播放器的请求头信息更多,需要18字节
                // 基本与liveChatOld.convertToArrayBuffer相同
                liveChat.convertToArrayBuffer = function (body, option) {
                    let headerBuf = new ArrayBuffer(Pl.WS_PACKAGE_HEADER_TOTAL_LENGTH);
                    let viewer = new DataView(headerBuf, Pl.WS_PACKAGE_OFFSET);
                    let bodyBuf = encoder.encode(JSON.stringify(body));
                    viewer.setInt32(Pl.WS_PACKAGE_OFFSET, Pl.WS_PACKAGE_HEADER_TOTAL_LENGTH + bodyBuf.byteLength);
                    wsBinaryHeaderList[2].value = option;
                    wsBinaryHeaderList.forEach((function (i) {
                        4 === i.bytes ? (viewer.setInt32(i.offset, i.value),
                            "seq" === i.key && ++i.value) : 2 === i.bytes ? viewer.setInt16(i.offset, i.value) : 1 === i.bytes && viewer.setInt8(i.offset, i.value)
                    }));
                    return mergeArrayBuffer(headerBuf, bodyBuf);
                }

                // jsc-player > i.prototype.convertToObject
                // convertToArrayBuffer对应的解码函数
                liveChat.convertToObject = function (i) {
                    var e = new DataView(i), t = {};
                    t.packetLen = e.getInt32(Pl.WS_PACKAGE_OFFSET);
                    wsBinaryHeaderList.forEach((function (i) {
                        4 === i.bytes ? t[i.key] = e.getInt32(i.offset) : 2 === i.bytes ? t[i.key] = e.getInt16(i.offset) : 1 === i.bytes && (t[i.key] = e.getInt8(i.offset))
                    }));
                    if (t.op && t.op === Pl.WS_OP_BATCH_DATA) {
                        t.body = this.parseDanmaku(i, e, Pl.WS_PACKAGE_HEADER_TOTAL_LENGTH, t.packetLen);
                    }
                    else if (t.op && Pl.WS_OP_DATA === t.op) {
                        t.body = this.parseDanmaku(i, e, Pl.WS_PACKAGE_OFFSET, t.packetLen);
                    }
                    else if (t.op && t.op === Pl.WS_OP_OGVCMD_REPLY) {
                        t.body = ""; // this.parseOgvCmd(i, e, Pl.WS_PACKAGE_OFFSET, t.packetLen);
                    }
                    else if (t.op) {
                        t.body = [];
                        for (var a = Pl.WS_PACKAGE_OFFSET, r = t.packetLen, n = "", l = ""; a < i.byteLength; a += r) {
                            r = e.getInt32(a);
                            n = e.getInt16(a + Pl.WS_HEADER_OFFSET);
                            try {
                                l = JSON.parse(decoder.decode(i.slice(a + n, a + r)));
                                t.body = l;
                            } catch (e) {
                                l = decoder.decode(i.slice(a + n, a + r));
                                console.error("decode body error:", new Uint8Array(i), t);
                            }
                        }
                    }
                    return t;
                }

                // jsc-player > i.prototype.parseDanmaku
                liveChat.parseDanmaku = function (i, e, t, a) {
                    for (var r, n = [], l = t; l < i.byteLength; l += a) {
                        a = e.getInt32(l);
                        r = e.getInt16(l + Pl.WS_HEADER_OFFSET);
                        try {
                            n.push(JSON.parse(decoder.decode(i.slice(l + r, l + a))));
                        } catch (e) {
                            n.push(decoder.decode(i.slice(l + r, l + a)));
                            console.error("decode body error:", new Uint8Array(i));
                        }
                    }
                    return n;
                }
            }
        }
        /**
         * hook worker
         */
        worker() {
            // hook postMessage来得到旧播放器创建的 获取list.so 的worker对象
            let workerPostMsg = Worker.prototype.postMessage;
            let list_so;
            Worker.prototype.postMessage = function (aMessage, transferList) {
                if (aMessage.url && aMessage.url.includes("list.so")) {
                    list_so = this;
                    let triggerOnMsg = (danmaku, loadTime, parseTime) => list_so.onmessage({
                        data: {
                            code: 0,
                            danmakuArray: danmaku,
                            loadTime: loadTime,
                            parseTime: parseTime,
                            sendTip: "",
                            state: 0,
                            textSide: "",
                            total: danmaku.length.toString()
                        }
                    });
                    let loadDanmaku = (loadTime) => BLOD.getSegDanmaku().then(Segments => {
                        // 旧播放器需要得到耗时数据(网络请求，数据处理)
                        loadTime = new Date() - loadTime;
                        let parseTime = new Date();
                        let danmaku = BLOD.AllDanmaku.format(Segments);
                        parseTime = new Date() - parseTime;
                        triggerOnMsg(danmaku, loadTime, parseTime);
                        BLOD.toXml(Segments).then(result => BLOD.xml = result);
                    });
                    if (XMLHttpRequest.prototype.pakku_send === undefined) {
                        loadDanmaku(new Date());
                    }
                    else {
                        // 让pakku.js载入弹幕
                        let url = "https://api.bilibili.com/x/v2/dm/web/seg.so?type=1&oid=" + BLOD.cid + "&pid=" + BLOD.aid + "&segment_index=1";
                        BLOD.xhr.true(url, "arraybuffer").then((response) => {
                            let Segments = BLOD.segDmDecode(response);
                            // pakku.js处于“休眠中”时，不会修改响应数据，这时的response仅仅是第一个分段的弹幕数据
                            // 这种情况下需要主动去加载全部的分段(loadDanmaku)
                            let i = 1;
                            for (; i < Segments.length; i++) {
                                // pakku.js处理过的弹幕，在出现时间上按升序排列，可以用这个特征加以区别是否应该载入完整的弹幕
                                if (Segments[i - 1].progress > Segments[i].progress) break;
                            }
                            if (i != Segments.length)
                                loadDanmaku(new Date());
                            else {
                                triggerOnMsg(BLOD.AllDanmaku.format(Segments), "(pakku.js)", "(pakku.js)");
                                BLOD.toXml(Segments).then((result) => (BLOD.xml = result));
                            }
                        });
                    }
                } else {
                    workerPostMsg.call(this, aMessage, transferList);
                }
            }
        }
        /**
         * hook XMLHttpRequest.prototype.open
         */
        open() {
            const open = XMLHttpRequest.prototype.open;
            XMLHttpRequest.prototype.open = function (method, url, ...rest) {
                let args = [method, url, ...rest];
                openArray.forEach(d => d(this, args));
                return open.call(this, ...args);
            }
        }
        /**
         * hook jsonp
         */
        jsonp() {
            window.$.ajaxSetup({
                beforeSend: function (xhr) {
                    let jsonp = this; // jsonp 对象
                    jsonpArray.forEach(d => d(xhr, jsonp));
                }
            })
        }
        /**
                            * hook sendBeacon
                            */
        sendBeacon() {
            let sendBeacon = Navigator.prototype.sendBeacon;
            Navigator.prototype.sendBeacon = function (url, data) {
                if (url.includes("data.bilibili.com")) return true;
                else return sendBeacon.call(this, url, data);
            }
        }
        /**
         * 添加xhrhook
         * @returns {number} xhrhook序号
                            */
        xhrhook(callback) {
            if (typeof callback === "function") openArray.push(callback);
            return openArray.length - 1;
        }
        /**
         * 添加jsonphook
         * @returns {number} xhrhook序号
                            */
        jsonphook(callback) {
            if (typeof callback === "function") jsonpArray.push(callback);
            return jsonpArray.length - 1;
        }
        /**
         * 移除xhrhook
         * @param {number} id xhrhook序号
                            */
        quitXhrhook(id) {
            openArray.splice(id, 1);
        }
        /**
         * 移除jsonphook
         * @param {number} id jsonphook序号
                            */
        quitJsonphook(id) {
            jsonpArray.splice(id, 1);
        }
    }
    new Xhrhook();

    class Danmaku {
        constructor() {
            BLOD.getSegDanmaku = (aid, cid, bas) => this.getSegDanmaku(aid, cid, bas);
            BLOD.specialEffects = dm => this.specialEffects(dm);
            BLOD.sortDmById = (danmaku, key) => this.sortDmById(danmaku, key);
            BLOD.toXml = danmaku => this.toXml(danmaku);
            BLOD.getHistoryDanmaku = (date, cid) => this.getHistoryDanmaku(date, cid);
            BLOD.loadLocalDm = (xml, append) => this.loadLocalDm(xml, append);
            BLOD.segDmDecode = (response) => this.segDmDecode(response);

            BLOD.xhrhook((xhr, args) => {
                // 新版弹幕兼容pakku.js
                if (args[1].includes("list.so")) {
                    // 在历史弹幕面板切换回当天的弹幕时，播放器不通过web worker加载弹幕，而是直接请求list.so
                    // 备份弹幕
                    xhr.addEventListener("load", () => {
                        BLOD.xml = xhr.response;
                    });
                }
                // 历史弹幕
                if (args[1].includes("history?type=")) {
                    let param = BLOD.urlObj(args[1]);
                    if (param.date) {
                        Object.defineProperty(xhr, "response", { writable: true });
                        Object.defineProperty(xhr, "readyState", { writable: true });
                        Object.defineProperty(xhr, "status", { writable: true });
                        Object.defineProperty(xhr, "send", { writable: true });
                        xhr.readyState = 4;
                        xhr.status = 200;
                        xhr.send = () => { };

                        let history = "https://api.bilibili.com/x/v2/dm/web/history/seg.so?type=1&oid=" + BLOD.cid + "&date=" + param.date;
                        BLOD.xhr(history, "arraybuffer").then(seg => {
                            let segDm = this.protoSeg.decode(new Uint8Array(seg)).elems;
                            BLOD.setDanmaku(BLOD.AllDanmaku.format(segDm));
                            this.toXml(segDm).then(xml => BLOD.xml = xml);
                        }).catch((e) => {
                            toast.error("载入历史弹幕失败", "请尝试刷新页面");
                            toast.error(e);
                        });
                    }
                }
            })
        }
        /**
         * 生成xml形式的弹幕
         * @param  {[]} danmaku protoSeg.decode(new Uint8Array(this.response)).elems
                            * @returns {Promise < String >} 委托对象，表示生成的xml形式的弹幕字符串
                            */
        toXml(danmaku) {
            return new Promise((resolve) => {
                this.sortDmById(danmaku, "idStr");
                let attr = [], xml = '<?xml version="1.0" encoding="UTF-8"?><i><chatserver>chat.bilibili.com</chatserver><chatid>' + BLOD.cid + '</chatid><mission>0</mission><maxlimit>99999</maxlimit><state>0</state><real_name>0</real_name><source>e-r</source>\r\n'
                for (let i = 0; i < danmaku.length; i++) {
                    attr[0] = danmaku[i].progress / 1000;
                    attr[1] = danmaku[i].mode;
                    attr[2] = danmaku[i].fontsize;
                    attr[3] = danmaku[i].color;
                    attr[4] = danmaku[i].ctime;
                    attr[5] = danmaku[i].pool;
                    attr[6] = danmaku[i].midHash;
                    attr[7] = danmaku[i].idStr;
                    xml += '<d p="' + attr.join(",") + '">' + danmaku[i].content.replace(/[<">'&]/g, (a) => { return { '<': '&lt;', '"': '&quot;', '>': '&gt;', "'": '&#39;', '&': '&amp;' }[a] }) + '</d>\r\n';
                }
                xml += "</i>";
                /**
                 * remove-invalid-xml-characters.js
                 * @link https://gist.github.com/john-doherty/b9195065884cdbfd2017a4756e6409cc
                 * @license MIT
                 * @see https://en.wikipedia.org/wiki/Valid_characters_in_XML
                 */
                var regex = /((?:[\0-\x08\x0B\f\x0E-\x1F\uFFFD\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]))/g;
                resolve(xml.replace(regex, ''));
            });
        }
        /**
         * 将弹幕数组按弹幕id升序排序
         * @param  {[]} danmaku 要排序的弹幕数组
         * @param  {string} key 弹幕id的属性名，应为dmid或idStr
         */
        sortDmById(danmaku, key) {
            let egx = /^\d+$/;
            for (let i = 0, d; i < danmaku.length; i++) {
                d = danmaku[i];
                // 判断输入是否纯数字
                if (!egx.test(d[key])) throw "请输入数字字符串";
                // 强制转化输入为字符串
                if (typeof d[key] !== "string") d[key] = String(d[key]);
                // 去除数字开头占位的0
                d[key] = d[key].replace(/^0+/, "");
            }
            danmaku.sort((a, b) => this.bigInt(a[key], b[key]) ? 1 : -1);
        }
        /**
         * 比较大小，仅用于弹幕排序
         * @param {string} num1 数字字符串 1
         * @param {string} num2 数字字符串 2
         * @returns {boolean} 前者大于后者返回真，否则返回假，相等也返回假
         */
        bigInt(num1, num2) {
            // 数位不同，前者大为真，否则为假
            if (num1.length > num2.length) return true;
            else if (num1.length < num2.length) return false;
            else {
                // 数位相同，逐位比较
                for (let i = 0; i < num1.length; i++) {
                    // 任意一位前者大为真
                    if (num1[i] > num2[i]) return true;
                    // 任意一位前者小为假
                    if (num1[i] < num2[i]) return false;
                    // 仅当位相等时继续比较下一位
                }
                // 包括相等情况返回假
                return false;
            }
        }
        /**
         * 初始化proto弹幕引擎
         * @returns {void}
         */
        protoInit() {
            if (this.root) return;
            BLOD.importModule("protojs"); // 载入proto引擎
            this.root = window.protobuf.Root.fromJSON(JSON.parse(BLOD.GM.getResourceText("protobuf"))); // 初始化proto引擎
            this.protoSeg = this.root.lookupType('bilibili.DmSegMobileReply'); // 弹幕解析引擎
            this.protoView = this.root.lookupType('bilibili.DmWebViewReply'); // 弹幕配置数据
        }
        /**
         * 获取 proto 弹幕
         * @param {number} [aid] 弹幕所对应视频的 aid，当前视频请留空
         * @param {number} [cid] 弹幕所对应视频的 cid，当前视频请留空
         * @param {boolean} [bas] 是否只获取BAS/代码弹幕，默认请留空
         * @returns {Promise<[{}]>} 弹幕数组：Promise
         */
        async getSegDanmaku(aid = BLOD.aid, cid = BLOD.cid, bas = false) {
            try {
                this.protoInit(); // 初始化弹幕引擎
                // 判断参数是否有效
                aid = aid || BLOD.aid;
                cid = cid || BLOD.cid;
                if (!aid || !cid) throw ["弹幕参数错误！", "aid：" + aid, "cid：" + cid];
                // 首先获取弹幕分片总数
                let config = await BLOD.xhr(BLOD.objUrl("https://api.bilibili.com/x/v2/dm/web/view", {
                    type: 1,
                    oid: cid,
                    pid: aid
                }), "arraybuffer");
                config = this.protoView.decode(new Uint8Array(config));
                // dmSge.total代表的分片总数，有时错误地为100
                // 故需要按照 视频时长/分片时长(一般是360秒) 把分片总数计算出来
                let pageSize = config.dmSge.pageSize ? config.dmSge.pageSize / 1000 : 360;
                let total = (window.player && window.player.getDuration && (window.player.getDuration() / pageSize + 1)) || config.dmSge.total;
                let allrequset = [], allDanmaku = [];
                // 其他视频的分片总数已经不能从当前window下获取
                if (BLOD.aid && (aid != BLOD.aid)) total = config.dmSge.total;
                if (!bas) {
                    // 特殊情况下只需要BAS/高级弹幕时 bas为真
                    for (let index = 1; index <= total; index++) {
                        allrequset.push(BLOD.xhr(BLOD.objUrl("https://api.bilibili.com/x/v2/dm/web/seg.so", {
                            type: 1,
                            oid: cid,
                            pid: aid,
                            segment_index: index
                        }), "arraybuffer"));
                    }
                }
                // BAS弹幕
                if (config.specialDms.length > 0) {
                    for (let index = 0; index < config.specialDms.length; index++) {
                        // 下发的是http链接，但会被chrome的安全措施拦掉，于是替换成https
                        allrequset.push(BLOD.xhr(config.specialDms[index].replace("http", "https"), "arraybuffer", {}, false));
                    }
                }
                // 互动弹幕
                let upHighlightDm = []; // 带有蓝色“UP主”特殊标记的弹幕
                if (config.commandDms.length > 0) {
                    for (let i = 0; i < config.commandDms.length; i++) {
                        let cdm = config.commandDms[i];
                        if (cdm.command == "#UP#") {
                            cdm.styleClass = "danmaku-up-icon";
                            cdm.color = 16777215;
                            cdm.pool = 0;
                            cdm.fontsize = 25;
                            cdm.ctime = new Date(cdm.mtime).getTime() / 1000;
                            cdm.mode = 1;
                            BLOD.importModule("crc");
                            cdm.midHash = BLOD.crc32 && ((BLOD.crc32(cdm.mid) ^ -1) >>> 0).toString(16);
                            upHighlightDm.push(cdm);
                            config.commandDms.splice(i, 1);
                        }
                    }
                    if (BLOD.loadCommandDm)
                        BLOD.loadCommandDm(config.commandDms, aid, cid);
                }
                // 解码弹幕
                (await Promise.all(allrequset)).forEach(d => {
                    if (d) allDanmaku = allDanmaku.concat(this.protoSeg.decode(new Uint8Array(d)).elems);
                });
                return allDanmaku.concat(upHighlightDm);
            } catch (e) { e = Array.isArray(e) ? e : [e]; toast.error("获取新版弹幕", ...e); }
        }
        /**
         * 获取历史弹幕
         * @param {string} date 历史弹幕日期，yyyy-mm-dd格式：如 2009-06-24
         * @param {number} [cid] 弹幕所在视频的 cid，不填则取当前视频的cid
         * @returns {Promise<[{}]>} 解析好的弹幕数组
         */
        async getHistoryDanmaku(date, cid = BLOD.cid) {
            if (!date || !BLOD.uid) return;
            cid = cid || BLOD.cid;
            let dm = await BLOD.xhr(BLOD.objUrl("https://api.bilibili.com/x/v2/dm/web/history/seg.so", {
                type: 1,
                oid: cid,
                date: date
            }), "arraybuffer");
            return this.segDmDecode(dm);
        }
        /**
         * 
         * @param {string} xml 读取本地弹幕文件得到的字符串
         * @param {boolean} [append] 默认为false，即不保留已加载的弹幕。为true时，则将追加到现有弹幕上
         * @returns {void}
         */
        loadLocalDm(xml, append) {
            xml = new DOMParser().parseFromString(xml, "application/xml");
            let dm = xml.querySelectorAll("d");
            if (dm.length == 0) {
                toast.warning("从弹幕文件中没有获取到任何弹幕！");
                return;
            }
            let danmaku = [];
            let attr, v, mode;
            for (let i = 0; i < dm.length; i++) {
                v = dm[i];
                attr = v.getAttribute('p').split(",");
                mode = parseInt(attr[1]);
                danmaku[i] = {
                    class: parseInt(attr[5]),
                    color: parseInt(attr[3]),
                    date: parseInt(attr[4]),
                    dmid: attr[7],
                    mode: mode,
                    size: parseInt(attr[2]),
                    stime: parseFloat(attr[0]),
                    text: (mode != 8 && mode != 9) ? v.textContent.replace(/(\/n|\\n|\n|\r\n)/g, '\n') : v.textContent,
                    uid: attr[6]
                };
            }
            this.specialEffects(danmaku);
            this.sortDmById(danmaku, "dmid");
            /**
             * bilibiliPlayer.js 21394行已经添加如下代码，用于设置弹幕池
             * @param  {Array} dm 弹幕数组
             * @param  {Boolean} append 默认为false，即不保留已加载的弹幕。为true时，则将追加到现有弹幕上
             */
            // BLOD.setDanmaku = (dm) => {......}

            if (!BLOD.setDanmaku) return toast.error("刷新弹幕列表失败：播放器内部调用丢失！");
            BLOD.setDanmaku(danmaku, append);
        }
        /**
         * 把有换行符的弹幕的zindex设为它的出现时间(progress)，并且打上“字幕弹幕”标记
         * @param {[]} dm 弹幕数组
         */
        specialEffects(dm) {
            let textData;
            for (let i = 0; i < dm.length; i++) {
                textData = dm[i];
                if (textData.text.includes('\n')) {
                    textData.class = 1;
                    textData.zIndex = textData.stime * 1000;
                    if (!(textData.text.includes("█") || textData.text.includes("▂")))
                        textData.zIndex = textData.zIndex + 1;
                }
            }
        }
        segDmDecode(response) {
            this.protoInit(); // 初始化弹幕引擎
            return this.protoSeg.decode(new Uint8Array(response)).elems;
        }
    }
    new Danmaku();
})();
