const request = require('request');
const setCookie = require('set-cookie-parser');


function queryString(n) {
    var t = "";
    for (let e in n)
        t += e + "=" + encodeURIComponent(n[e]) + "&";
    return t.slice(0, -1)
}

/**
 * 返回的是 Cookie
 */
exports.login = async function (phone, password) {
    let loginBody = {
        phone,
        password
    };
    //
    console.log(loginBody);
    return await new Promise(function (resolve, reject) {
        request({
            // url: 'https://tiku.fenbi.com/api/users/loginV2',
            url: 'https://login.fenbi.com/api/users/loginV2?app=web&kav=100&av=100&hav=100&version=3.0.0.0',
            method: 'POST',
            json: true,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
            },
            body: queryString(loginBody),
        }, function (err, httpResponse, body) {
            console.log(body);
            if (err) reject(httpResponse);
            if (body.code === 1) {
      
                resolve(setCookie.parse(httpResponse.headers['set-cookie']));
            } else {
                console.log(body);

            }

        });
    });
}