/* 自定义配置 */
/* 尚未完善 */
$(function () {
    let url = "./setting.json?v=20260816-5"
    $.getJSON(
        url,
        function (data) {
            /* 页头数据 */
            $('title').text(data.title);
            $('#loading-title').html(data.title);
            $("meta[name='description']").attr('content', data.description);
            $("meta[name='keywords']").attr('content', data.keywords);
            $("meta[name='author']").attr('content', data.author);
            /* 基础信息 */
            $("#logo-img").attr("src", data.logo_img);
            $('#logo-text-1').html(data.logo_text_1);
            $('#logo-text-2').html("." + data.logo_text_2);
            $('#logo-title-other').html(data.logo_text_1);
            $('#logo-title-other-small').html("." + data.logo_text_2);
            $('#logo-text-small').html(data.logo_text_1 + "." + data.logo_text_2);
            /* 社交链接 */
            $('#github').attr('href', "https://github.com/" + data.github);
            $('#qq').attr('href', "https://wpa.qq.com/msgrd?v=3&uin=" + data.qq + "&site=qq&menu=yes");
            $('#email').attr('href', "mailto:" + data.email);
            $('#bilibili').attr('href', "https://space.bilibili.com/" + data.bilibili);
            /* 快捷链接 */
            $('#link-url-1').attr('href', data.link_1[0]);
            $('#link-icon-1').attr('class', data.link_1[1]);
            $('#link-name-1').html(data.link_1[2]);
            $('#link-url-2').attr('href', data.link_2[0]);
            $('#link-icon-2').attr('class', data.link_2[1]);
            $('#link-name-2').html(data.link_2[2]);
            $('#link-url-3').attr('href', data.link_3[0]);
            $('#link-icon-3').attr('class', data.link_3[1]);
            $('#link-name-3').html(data.link_3[2]);
            $('#link-url-4').attr('href', data.link_4[0]);
            $('#link-icon-4').attr('class', data.link_4[1]);
            $('#link-name-4').html(data.link_4[2]);
            $('#link-url-5').attr('href', data.link_5[0]);
            $('#link-icon-5').attr('class', data.link_5[1]);
            $('#link-name-5').html(data.link_5[2]);
            $('#link-url-6').attr('href', data.link_6[0]);
            $('#link-icon-6').attr('class', data.link_6[1]);
            $('#link-name-6').html(data.link_6[2]);
            //页脚版权
            $('#power-text').html(data.Copyright_text);
            $('#footer-note').html("·&nbsp;" + data.footer_note);
        }
    )
});

// 背景图片 Cookies 
function setBgImg(bg_img) {
    if (bg_img) {
        // 🔴 修复2：强制转化为标准 JSON 字符串，防止存入坏数据
        Cookies.set('bg_img', JSON.stringify(bg_img), {
            expires: 36500
        });
        return true;
    }
    return false;
};

// 获取背景图片 Cookies
function getBgImg() {
    let bg_img_local = Cookies.get('bg_img');
    // 🔴 修复3：拦截错误数据 "[object Object]" 并增加错误保护罩
    if (bg_img_local && bg_img_local !== "{}" && bg_img_local !== "[object Object]") {
        try {
            return JSON.parse(bg_img_local);
        } catch (error) {
            console.log("拦截到旧版损坏的Cookie，已重置。");
            setBgImg(bg_img_preinstall);
            return bg_img_preinstall;
        }
    } else {
        setBgImg(bg_img_preinstall);
        return bg_img_preinstall;
    }
}

let bg_img_preinstall = {
    "type": "2", // 1:随机本地壁纸 2:每日一图 3:随机风景 4:随机动漫
    "2": "https://bing.biturl.top/?resolution=1920&format=json&index=0&mkt=zh-CN",
    "3": "https://tu.ltyuanfang.cn/api/fengjing.php",
    "4": "https://www.dmoe.cc/random.php"
};

function applyBackground(src) {
    const fallback = `./img/background${1 + ~~(Math.random() * 10)}.webp`;
    $('#bg')
        .removeClass('error')
        .off('error.background')
        .one('error.background', function () {
            $(this).attr('src', fallback);
        })
        .attr('src', src);
}

async function applyDailyBackground() {
    try {
        const response = await fetch(bg_img_preinstall[2], { signal: AbortSignal.timeout(8000) });
        if (!response.ok) throw new Error(`Daily wallpaper returned ${response.status}`);
        const data = await response.json();
        if (!data.url) throw new Error('Daily wallpaper URL is missing');
        applyBackground(data.url);
    } catch (error) {
        console.warn('每日壁纸加载失败，已切换到本地壁纸', error);
        applyBackground(`./img/background${1 + ~~(Math.random() * 10)}.webp`);
    }
}

// 更改背景图片
function setBgImgInit() {
    let bg_img = getBgImg();
    $("input[name='wallpaper-type'][value=" + bg_img["type"] + "]").click();

    switch (bg_img["type"]) {
        case "1":
            applyBackground(`./img/background${1 + ~~(Math.random() * 10)}.webp`);
            break;
        case "2":
            applyDailyBackground();
            break;
        case "3":
            applyBackground(`${bg_img_preinstall[3]}?t=${Date.now()}`);
            break;
        case "4":
            applyBackground(`${bg_img_preinstall[4]}?t=${Date.now()}`);
            break;
    }
};

$(document).ready(function () {
    // 壁纸数据加载
    setBgImgInit();
    // 设置背景图片
    $("#wallpaper").on("click", ".set-wallpaper", function () {
        let type = $(this).val();
        let bg_img = getBgImg();
        bg_img["type"] = type;
        iziToast.show({
            icon: "fa-solid fa-image",
            timeout: 2500,
            message: '壁纸设置成功，刷新后生效',
        });
        setBgImg(bg_img);
    });
});
