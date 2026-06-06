const Koa = require('koa');
const KoaRouter = require('koa-router');
const koaBody = require('koa-body');

const render = require('koa-ejs');
const serve = require('koa-static');

const { httpRequest } = require('./util/httpUtil');
let headers = {
    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9",
    "accept-language": "zh-CN,zh-TW;q=0.9,zh;q=0.8",
    "cache-control": "max-age=0",
    "sec-fetch-dest": "document",
    "sec-fetch-mode": "navigate",
    "sec-fetch-site": "none",
    "sec-fetch-user": "?1",
    "upgrade-insecure-requests": "1"
};
function queryString(n) {
    var t = "";
    for (let e in n)
        t += e + "=" + encodeURIComponent(n[e]) + "&";
    return t.slice(0, -1)
}

const path = require('path');
const qs = require('qs');
const url = require('url');

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ [UNHANDLED REJECTION] 原因:', reason);
    console.error('❌ [UNHANDLED REJECTION] Promise:', promise);
});

const app = new Koa();
const router = new KoaRouter();
const exerciseResult = require('./service/exercisesResult');
const collectService = require('./service/collectService');
const { collectLogsMap } = require('./service/collectService');
const loginService = require('./service/loginService');
const { forEach } = require('lodash');

render(app, {
    root: path.join(__dirname, 'views'),
    layout: false,
    viewExt: 'ejs',
    cache: false,
    debug: false,
});

app.use(serve(__dirname + '/views/js'))

app.use(router.routes()).use(router.allowedMethods())

app.use(koaBody())

app.use(async (ctx, next) => {
    if (ctx.status === 404) {
        ctx.redirect('/history');
    } else {
        next();
    }
});

// 3. 启动端口
const port = 3000;
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});

router.get('/exercise/:exerciseId', async ctx => {
    let exerciseId = ctx.params.exerciseId;
    let costThreshold = Number.parseInt(ctx.query.cost || 70);
    let cookie = ctx.request.headers['cookie']
    let renderObj = await exerciseResult.getResultObj(exerciseId, costThreshold, cookie);
    if (renderObj) {
        await ctx.render('exerciseResult', renderObj);
    } else {
        ctx.redirect('/setup?redirectPath=' + ctx.originalUrl);
    }
});

router.get('/question/:questionId', async ctx => {
    let questionId = ctx.params.questionId;
    let cookie = ctx.request.headers['cookie']
    let renderObj = await exerciseResult.getQuestion(questionId, cookie);
    if (renderObj) {
        await ctx.render('question', renderObj);
    } else {
        ctx.redirect('/setup?redirectPath=' + ctx.originalUrl);
    }
});

router.post('/api/saveNote/:questionId', koaBody(), async ctx => {
    let cookie = ctx.request.headers['cookie']
    let questionId = ctx.params.questionId;
    let { noteContent } = ctx.request.body;
    ctx.body = await exerciseResult.saveNote(questionId, noteContent, cookie);
});

router.get('/calc', async ctx => {
    await ctx.render('calc', {});
});

router.get('/history', async ctx => {
    let cookie = ctx.request.headers['cookie']
    if (!cookie || !cookie.includes('userid')) {
        ctx.redirect('/setup');
    } else {
        let history = await exerciseResult.getExerciseHistory(cookie);
        await ctx.render('history', history);
    }
});

router.get('/history-category', async ctx => {
    let cookie = ctx.request.headers['cookie'];
    if (!cookie || !cookie.includes('userid')) {
        ctx.redirect('/setup');
    } else {
        const form = {
            type: 31,
            keypointId: 20997
        };
        const createExerciseResponse = await httpRequest({
            url: 'https://tiku.fenbi.com/android/xingce/exercises?version=6.17.82&vendor=fenbi&app=gwy&av=118&kav=115&hav=116&apcid=3&deviceId=CPfYyqugcHAfW56rs9eeEw==&cquiz=27',
            method: 'POST',
            headers: {
                ...headers,
                cookie,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: qs.stringify(form)
        });
        console.log(createExerciseResponse);
        await ctx.render('history-category', await exerciseResult.getExerciseHistory(cookie));
    }
});

router.get('/setup', async ctx => {
    // 🔐 清空 token Cookie（通常是登录凭证）
    ctx.cookies.set('token', '', {
        maxAge: 0,       // 设置为 0，表示立即过期，浏览器会删除它
        httpOnly: true,  // 推荐：防止 JavaScript 操作
        overwrite: true  // 覆盖已有的同名 cookie
    });

    // 🔐 清空 userId Cookie（如果有的话）
    ctx.cookies.set('userId', '', {
        maxAge: 0,
        httpOnly: true,
        overwrite: true
    });

    // 🔐 你可以继续清空其它自定义的 Cookie，比如：
    // ctx.cookies.set('sessionId', '', { maxAge: 0, overwrite: true });

    // 🧩 渲染 setup 页面（比如初始化 / 重置配置页面）
    await ctx.render('setup', {});
});

router.post('/api/login', koaBody(), async ctx => {
    let { phone, password } = ctx.request.body;
    let cookies = await loginService.login(phone, password);
    if (cookies.length > 1) {
        cookies.forEach(cookie => {
            let { name, value } = cookie;
            ctx.cookies.set(name, value, {
                path: '/',   //cookie写入的路径
                maxAge: 0,
                expires: new Date('2099-07-06'),
                httpOnly: false
            });
            let referer = ctx.request.headers.referer;
            let redirectPath = '/history';
            ctx.body = {
                code: 200,
                redirectPath
            };
        });
    } else {
        ctx.body = {
            code: 500
        };
    }
});

router.post('/api/collect/:questionId', async ctx => {
    let questionId = ctx.params.questionId;
    let cookie = ctx.request.headers['cookie']
    await exerciseResult.addCollect(questionId, cookie);
    ctx.body = '';
});

router.del('/api/collect/:questionId', async ctx => {
    let questionId = ctx.params.questionId;
    let cookie = ctx.request.headers['cookie']
    await exerciseResult.delCollect(questionId, cookie);
    ctx.body = '';
});

router.get('/api/video/:questionId', async ctx => {
    let questionId = ctx.params.questionId;
    let cookie = ctx.request.headers['cookie'];
    ctx.body = await exerciseResult.getVideoUrl(questionId, cookie);
});

router.get('/api/comment/:questionId', async ctx => {
    let questionId = ctx.params.questionId;
    let cookie = ctx.request.headers['cookie'];
    ctx.body = await exerciseResult.getComments(questionId, cookie);
});

router.post('/api/zj', koaBody(), async ctx => {
    let { word } = ctx.request.body;
    ctx.body = await exerciseResult.zjWord(word);
});

router.get('/favicon.ico', async ctx => {
    ctx.body = ''
});

router.all('/', async ctx => {
    let cookie = ctx.request.headers['cookie']
    if (!cookie || !cookie.includes('userid')) {
        ctx.redirect('/setup');
    } else {
        ctx.redirect('/history');
    }
});