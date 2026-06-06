const { concat } = require('lodash');
const qs = require('qs');
const { httpRequest } = require('../util/httpUtil');
const exerciseResult = require('./exercisesResult'); // 你的原有 service

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

// 检查并创建练习（如果没有），并将新创建的 exercise.id 设置回 page.exercise
async function createExerciseIfNeeded(page, cookie, pushLog) {
    let exercise = page.exercise; // 可能是 undefined
    const paperId = page.id;
    const name = page.name || '未知试卷';

    if (!exercise || !exercise.id) {
        pushLog && pushLog(`🆕 试卷 "${name}" 没有练习，正在创建...`);
        console.log(`🆕 试卷 "${name}" 没有练习，正在创建...`);
        const form = {
            type: 1,
            paperId: paperId,
            exerciseTimeMode: 2
        };

        try {
            await sleep(1000);
            const createExerciseResponse = await httpRequest({
                url: 'https://tiku.fenbi.com/api/xingce/exercises?app=web&kav=100&av=100&hav=100&version=3.0.0.0',
                method: 'POST',
                headers: {
                    ...headers,
                    cookie,
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: qs.stringify(form)
            });

            if (!createExerciseResponse) {
                console.log(`❌ 创建练习失败，试卷：${name}，响应为空`);
                return;
            }
            let exerciseResponse = JSON.parse(createExerciseResponse);
            let exerciseId = exerciseResponse.id;
            if (!exerciseId) {
                console.log(`❌ 创建练习失败，试卷：${name}，响应为:${createExerciseResponse}`);
                return;
            }
        } catch (err) {
            pushLog && pushLog(`❌ 创建练习出错：${err.message}`);
            console.log(`❌ 创建练习出错：${err.message}`);
        }
    } else {
        const exerciseId = exercise.id;
        pushLog && pushLog(`✅ 试卷 "${name}" 已有关联练习，exercise_id = ${exerciseId}`);
        console.log(`✅ 试卷 "${name}" 已有关联练习，exercise_id = ${exerciseId}`);
    }
}

async function getExerciseQuestions(exerciseId, cookie, pushLog) {
    try {
        const response = await exerciseResult.getExerciseExp(exerciseId, cookie);
        const questionIds = response?.sheet?.questionIds || [];
        // pushLog && pushLog(`✅ 获取到练习 ${exerciseId} 下的题目数量：${questionIds.length}`);
        return questionIds;
    } catch (error) {
        pushLog && pushLog(`❌ 获取练习 ${exerciseId} 的题目失败：${error.message}`);
        return [];
    }
}

async function  getCollectedQuestionIds(questionIds, cookie, pushLog) {

    try {
        // 正确检查数组是否为空
        const isQuestionIdsEmpty = Array.isArray(questionIds) && questionIds.length === 0;

        // 在外部声明 response 变量
        let response;

        if (isQuestionIdsEmpty) {
            response = await exerciseResult.getCollects(cookie);
        } else {
            response = await exerciseResult.getCollectsByIds(questionIds, cookie);
        }

        let collectedIds = [];
        // 安全提取已收藏的题目 IDs
        if (Array.isArray(response)) {
            collectedIds = response;
        }
        pushLog && pushLog(`🔍 已收藏的题目 IDs：${collectedIds.length} 个`); 
        return collectedIds;
    } catch (error) {
        pushLog && pushLog(`❌ 查询收藏状态失败：${error.message}`);
        return [];
    }
}

async function collectUnCollectedQuestions(unCollectedIds, cookie, pushLog) {
    let successCount = 0;
    for (let j = 0; j < unCollectedIds.length; j++) {
        const qid = unCollectedIds[j];
        try {
            await exerciseResult.addCollect(qid, cookie);
            successCount++;
        } catch (err) {
            pushLog && pushLog(`❌ 第 ${j + 1} 题 [${qid}] 收藏失败：${err.message}`);
            await sleep(500);
            try {
                await exerciseResult.addCollect(qid, cookie);
            } catch (retryErr) {
                pushLog && pushLog(`🔁 重试第 ${j + 1} 题 [${qid}] 仍然失败：${retryErr.message}`);
            }
        }
    }
//  pushLog && pushLog(`✅ 成功收藏了 ${successCount} 题`);
    return successCount;
}

// 获取所有试卷（分页拉取，同时为每张试卷检查并创建练习）
async function getPapers(cookie) {
    const pageSize = 45;
    const allPapers = [];
    let currentPage = 0;
    let totalPage = 1;
    const labelId = 6;

    // Step 1: 请求第 0 页，获取总页数
    const initialUrl = `https://tiku.fenbi.com/api/xingce/papers/?toPage=${currentPage}&pageSize=${pageSize}&labelId=${labelId}&app=web&kav=100&av=100&hav=100&version=3.0.0.0`;

    const initialResponse = await httpRequest({
        url: initialUrl,
        method: 'GET',
        json: true,
        headers: { ...headers, cookie }
    });

    const initialData = initialResponse;
    const initialList = initialData.list || [];
    const pageInfo = initialData.pageInfo || {};

    totalPage = pageInfo.totalPage || 1;
    console.log(`📄 总共有 ${totalPage} 页试卷`);

    // Step 2: 检查第 0 页的试卷是否有关联练习，没有则创建
    for (const page of initialList) {
        await createExerciseIfNeeded(page, cookie, () => { }); // 不传 pushLog，避免日志污染
    }

    allPapers.push(...(initialList || []));

    // Step 3: 请求后续页
    for (let page = currentPage + 1; page < totalPage; page++) {
        const url = `https://tiku.fenbi.com/api/xingce/papers/?toPage=${page}&pageSize=${pageSize}&labelId=${labelId}&app=web&kav=100&av=100&hav=100&version=3.0.0.0`;

        console.log(`🔁 正在请求第 ${page + 1} 页...`);
        const response = await httpRequest({
            url,
            method: 'GET',
            json: true,
            headers: { ...headers, cookie }
        });
        const data = response;
        const pageList = data.list || [];

        if (!Array.isArray(pageList)) {
            console.warn(`⚠️ 第 ${page + 1} 页未返回有效的试卷列表`);
            continue;
        }

        // 检查每张试卷的练习
        for (const p of pageList) {
            await createExerciseIfNeeded(p, cookie, () => { });
        }

        allPapers.push(...pageList);
        console.log(`✅ 第 ${page + 1} 页获取到 ${pageList.length} 张试卷`);
    }

    console.log(`📦 总共获取到 ${allPapers.length} 张试卷`);
    return allPapers;
}

const collectLogsMap = new Map(); // 全局存储 requestId -> 日志数组

// ✅ 先定义 sleep 函数
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function delAllCollect(cookie) {

    const qids = await getCollectedQuestionIds([], cookie);
    if (Array.isArray(qids) && qids.length !== 0) {
        console.log(qids);
        for (let qid of qids) {
            await exerciseResult.delCollect(qid, cookie);
        }
    }
}

module.exports = {
    getPapers,
    delAllCollect,
    collectLogsMap, // 暴露出去，方便在路由里用（也可以用其他方式共享）
};