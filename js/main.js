

//弹窗样式
iziToast.settings({
    timeout: 10000,
    progressBar: false,
    close: false,
    closeOnEscape: true,
    position: 'topCenter',
    transitionIn: 'bounceInDown',
    transitionOut: 'flipOutX',
    displayMode: 'replace',
    layout: '1',
    backgroundColor: '#00000040',
    titleColor: '#efefef',
    messageColor: '#efefef',
    icon: 'Fontawesome',
    iconColor: '#efefef',
});

/* 鼠标样式 */
const body = document.querySelector("body");
const element = document.getElementById("g-pointer-1");
const element2 = document.getElementById("g-pointer-2");
const halfAlementWidth = element.offsetWidth / 2;
const halfAlementWidth2 = element2.offsetWidth / 2;

function setPosition(x, y) {
    element2.style.transform = `translate(${x - halfAlementWidth2 + 1}px, ${y - halfAlementWidth2 + 1}px)`;
}

body.addEventListener('mousemove', (e) => {
    window.requestAnimationFrame(function () {
        setPosition(e.clientX, e.clientY);
    });
});



//加载完成后执行
window.addEventListener('load', function () {

    //载入动画
    // Let the apple complete its fall before the loading layer expands away.
    setTimeout(() => $('#loading-box').attr('class', 'loaded'), 1350);
    $('#bg').css("cssText", "transform: scale(1);filter: blur(0px);transition: ease 1.5s;");
    $('.cover').css("cssText", "opacity: 1;transition: ease 1.5s;");
    $('#section').css("cssText", "transform: scale(1) !important;opacity: 1 !important;filter: blur(0px) !important");

    //用户欢迎
    setTimeout(function () {
        iziToast.show({
            timeout: 2500,
            icon: false,
            title: hello,
            message: '欢迎来到我的主页'
        });
    }, 800);

    //延迟加载音乐播放器
    let element = document.createElement("script");
    element.src = "./js/music.js?v=20260816-18";
    document.body.appendChild(element);

    //中文字体缓加载-此处写入字体源文件 （暂时弃用）
    //先行加载简体中文子集，后续补全字集
    //由于压缩过后的中文字体仍旧过大，可转移至对象存储或 CDN 加载
    // const font = new FontFace(
    //     "MiSans",
    //     "url(" + "./font/MiSans-Regular.woff2" + ")"
    // );
    // document.fonts.add(font);

    //移动端去除鼠标样式
    if (Boolean(window.navigator.userAgent.match(/AppWebKit.*Mobile.*/))) {
        $('#g-pointer-2').css("display", "none");
    }

}, false)

setTimeout(function () {
    $('#loading-text').html("字体及文件加载可能需要一定时间")
}, 3000);

// 新春灯笼 （ 需要时可取消注释 ）
// new_element=document.createElement("link");
// new_element.setAttribute("rel","stylesheet");
// new_element.setAttribute("type","text/css");
// new_element.setAttribute("href","./css/lantern.css");
// document.body.appendChild(new_element);

// new_element=document.createElement("script");
// new_element.setAttribute("type","text/javascript");
// new_element.setAttribute("src","./js/lantern.js");
// document.body.appendChild(new_element);

//获取一言
fetch('https://v1.hitokoto.cn?max_length=24')
    .then(response => response.json())
    .then(data => {
        $('#hitokoto_text').html(data.hitokoto)
        $('#from_text').html(data.from)
    })
    .catch(console.error)

let times = 0;
$('#hitokoto').click(function () {
    if (times == 0) {
        times = 1;
        let index = setInterval(function () {
            times--;
            if (times == 0) {
                clearInterval(index);
            }
        }, 1000);
        fetch('https://v1.hitokoto.cn?max_length=24')
            .then(response => response.json())
            .then(data => {
                $('#hitokoto_text').html(data.hitokoto)
                $('#from_text').html(data.from)
            })
            .catch(console.error)
    } else {
        iziToast.show({
            timeout: 1000,
            icon: "fa-solid fa-circle-exclamation",
            message: '你点太快了吧'
        });
    }
});

// 无密钥 IP 定位采用双源回退，再由 Open-Meteo 提供实时天气。
const defaultWeatherLocation = {
    city: '成都',
    latitude: 30.5728,
    longitude: 104.0668,
    timezone: 'Asia/Shanghai',
};

let activeTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

const locationProviders = [
    {
        url: 'https://ipwho.is/',
        parse(data) {
            if (data.success === false) throw new Error(data.message || 'IPWho location failed');
            return {
                city: data.city || data.region || data.country,
                latitude: Number(data.latitude),
                longitude: Number(data.longitude),
                timezone: data.timezone?.id,
            };
        },
    },
    {
        url: 'https://get.geojs.io/v1/ip/geo.json',
        parse(data) {
            return {
                city: data.city || data.region || data.country,
                latitude: Number(data.latitude),
                longitude: Number(data.longitude),
                timezone: data.timezone,
            };
        },
    },
];

const weatherDescriptions = {
    0: '晴',
    1: '大部晴朗',
    2: '多云',
    3: '阴',
    45: '有雾',
    48: '雾凇',
    51: '小毛毛雨',
    53: '毛毛雨',
    55: '强毛毛雨',
    56: '冻毛毛雨',
    57: '强冻毛毛雨',
    61: '小雨',
    63: '中雨',
    65: '大雨',
    66: '冻雨',
    67: '强冻雨',
    71: '小雪',
    73: '中雪',
    75: '大雪',
    77: '米雪',
    80: '小阵雨',
    81: '阵雨',
    82: '强阵雨',
    85: '小阵雪',
    86: '强阵雪',
    95: '雷雨',
    96: '雷雨伴冰雹',
    99: '强雷雨伴冰雹',
};

function getWindDirection(degrees) {
    const directions = ['北风', '东北风', '东风', '东南风', '南风', '西南风', '西风', '西北风'];
    return directions[Math.round(degrees / 45) % directions.length];
}

function getWindScale(speed) {
    const thresholds = [1, 6, 12, 20, 29, 39, 50, 62, 75, 89, 103, 118];
    const scale = thresholds.findIndex(threshold => speed < threshold);
    return `${scale === -1 ? 12 : scale}级`;
}

async function getVisitorLocation() {
    for (const provider of locationProviders) {
        try {
            const response = await fetch(provider.url, { signal: AbortSignal.timeout(5000) });
            if (!response.ok) throw new Error(`Location service returned ${response.status}`);
            const location = provider.parse(await response.json());
            if (!location.city || !Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) {
                throw new Error('Location service returned incomplete data');
            }
            return location;
        } catch (error) {
            console.warn('IP 定位源不可用，正在尝试备用源', error);
        }
    }

    return defaultWeatherLocation;
}

async function getWeather() {
    const weatherLocation = await getVisitorLocation();
    window.homeWeatherLocation = weatherLocation;
    try {
        new Intl.DateTimeFormat('zh-CN', { timeZone: weatherLocation.timezone }).format();
        activeTimezone = weatherLocation.timezone;
    } catch (error) {
        console.warn('定位服务返回了无效时区，继续使用浏览器时区', error);
    }
    const params = new URLSearchParams({
        latitude: weatherLocation.latitude,
        longitude: weatherLocation.longitude,
        current: 'temperature_2m,weather_code,wind_speed_10m,wind_direction_10m',
        timezone: 'Asia/Shanghai',
        forecast_days: '1',
    });

    try {
        const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, {
            signal: AbortSignal.timeout(8000),
        });
        if (!response.ok) {
            throw new Error(`Open-Meteo returned ${response.status}`);
        }

        const data = await response.json();
        const current = data.current;
        $('#city_text').text(weatherLocation.city);
        $('#wea_text').text(weatherDescriptions[current.weather_code] || '天气变化中');
        $('#tem_text').text(`${Math.round(current.temperature_2m)}°C`);
        $('#win_text').text(getWindDirection(current.wind_direction_10m));
        $('#win_speed').text(getWindScale(current.wind_speed_10m));
        window.dispatchEvent(new CustomEvent('home:weather-changed', { detail: {
            code: Number(current.weather_code),
            temperature: Number(current.temperature_2m),
            windSpeed: Number(current.wind_speed_10m),
        } }));
        return true;
    } catch (error) {
        console.warn('天气加载失败', error);
        $('#city_text').text(weatherLocation.city);
        $('#wea_text').text('天气暂不可用');
        $('#tem_text, #win_text, #win_speed').text('');
        return false;
    }
}

getWeather();

let wea = 0;
$('#upWeather').click(async function () {
    if (wea == 0) {
        wea = 1;
        let index = setInterval(function () {
            wea--;
            if (wea == 0) {
                clearInterval(index);
            }
        }, 60000);
        const updated = await getWeather();
        iziToast.show({
            timeout: 2000,
            icon: updated ? "fa-solid fa-cloud-sun" : "fa-solid fa-circle-exclamation",
            message: updated ? '实时天气已更新' : '天气服务暂时不可用'
        });
    } else {
        iziToast.show({
            timeout: 1000,
            icon: "fa-solid fa-circle-exclamation",
            message: '请稍后再更新哦'
        });
    }
});

// 按 IP 定位得到的时区显示时间；定位失败时使用浏览器时区。
let t = null;
t = setTimeout(time, 1000);

function time() {
    clearTimeout(t);
    const now = new Date();
    const parts = Object.fromEntries(new Intl.DateTimeFormat('zh-CN', {
        timeZone: activeTimezone,
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        weekday: 'long',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
    }).formatToParts(now).map(part => [part.type, part.value]));
    const offset = new Intl.DateTimeFormat('zh-CN', {
        timeZone: activeTimezone,
        timeZoneName: 'shortOffset',
    }).formatToParts(now).find(part => part.type === 'timeZoneName')?.value || '';
    const timezoneText = [activeTimezone, offset].filter(Boolean).join(' · ');

    $("#time").html(
        `${parts.year}&nbsp;年&nbsp;${parts.month}&nbsp;月&nbsp;${parts.day}&nbsp;日&nbsp;` +
        `<span class='weekday'>${parts.weekday}</span><br>` +
        `<span class='time-text'>${parts.hour}:${parts.minute}:${parts.second}</span>` +
        `<span class='time-zone'>${timezoneText}</span>`
    );
    t = setTimeout(time, 1000);
}

//链接提示文字
$("#social").mouseover(function () {
    $("#social").css({
        "background": "rgb(0 0 0 / 25%)",
        'border-radius': '6px',
        "backdrop-filter": "blur(5px)"
    });
    $("#link-text").css({
        "display": "block",
    });
}).mouseout(function () {
    $("#social").css({
        "background": "none",
        "border-radius": "6px",
        "backdrop-filter": "none"
    });
    $("#link-text").css({
        "display": "none"
    });
});

$("#github").mouseover(function () {
    $("#link-text").html("去 Github 看看");
}).mouseout(function () {
    $("#link-text").html("找到峰");
});
$("#qq").mouseover(function () {
    $("#link-text").html("有什么事吗");
}).mouseout(function () {
    $("#link-text").html("找到峰");
});
$("#email").mouseover(function () {
    $("#link-text").html("来封 Email");
}).mouseout(function () {
    $("#link-text").html("找到峰");
});
$("#bilibili").mouseover(function () {
    $("#link-text").html("去哔哩哔哩看看");
}).mouseout(function () {
    $("#link-text").html("找到峰");
});

//自动变灰
let myDate = new Date;
let mon = myDate.getMonth() + 1;
let date = myDate.getDate();
let days = ['4.4', '5.12', '7.7', '9.9', '9.18', '12.13'];
for (let day of days) {
    let d = day.split('.');
    if (mon == d[0] && date == d[1]) {
        document.write(
            '<style>html{-webkit-filter:grayscale(100%);-moz-filter:grayscale(100%);-ms-filter:grayscale(100%);-o-filter:grayscale(100%);filter:progid:DXImageTransform.Microsoft.BasicImage(grayscale=1);_filter:none}</style>'
        );
        $("#change").html("Silence&nbsp;in&nbsp;silence");
        $("#change1").html("今天是中国国家纪念日，全站已切换为黑白模式");
        window.addEventListener('load', function () {
            setTimeout(function () {
                iziToast.show({
                    timeout: 14000,
                    icon: "fa-solid fa-clock",
                    message: '今天是中国国家纪念日'
                });
            }, 3800);
        }, false);
    }
}

//更多页面切换
let shoemore = false;
$('#switchmore').on('click', function () {
    shoemore = !shoemore;
    if (shoemore && $(document).width() >= 990) {
        $('#container').attr('class', 'container mores');
        $("#change").html("Oops&nbsp;!");
        $("#change1").html("哎呀，这都被你发现了（ 再点击一次可关闭 ）");
    } else {
        $('#container').attr('class', 'container');
        $("#change").html("Build&nbsp;to&nbsp;Run");
        $("#change1").html("在电流与代码之间，把复杂系统锻造成可运行的闭环。");
    }
});

//更多页面关闭按钮
$('#close').on('click', function () {
    $('#switchmore').click();
});

//移动端菜单栏切换
let switchmenu = false;
$('#switchmenu').on('click', function () {
    switchmenu = !switchmenu;
    if (switchmenu) {
        $('#row').attr('class', 'row menus');
        $("#menu").html("<i class='fa-solid fa-xmark'></i>");
    } else {
        $('#row').attr('class', 'row');
        $("#menu").html("<i class='fa-solid fa-bars'></i>");
    }
});

//更多弹窗页面
$('#openmore').on('click', function () {
    $('#box').css("display", "block");
    $('#row').css("display", "none");
    $('#more').css("cssText", "display:none !important");
});
$('#closemore').on('click', function () {
    $('#box').css("display", "none");
    $('#row').css("display", "flex");
    $('#more').css("display", "flex");
});

//监听网页宽度
window.addEventListener('load', function () {
    window.addEventListener('resize', function () {
        //关闭移动端样式
        if (window.innerWidth >= 600) {
            $('#row').attr('class', 'row');
            $("#menu").html("<i class='fa-solid fa-bars'></i>");
            //移除移动端切换功能区
            $('#rightone').attr('class', 'row rightone');
        }

        if (window.innerWidth <= 990) {
            //移动端隐藏更多页面
            $('#container').attr('class', 'container');
            $("#change").html("Build&nbsp;to&nbsp;Run");
            $("#change1").html("在电流与代码之间，把复杂系统锻造成可运行的闭环。");

            //移动端隐藏弹窗页面
            $('#box').css("display", "none");
            $('#row').css("display", "flex");
            $('#more').css("display", "flex");
        }
    })
})

//移动端切换功能区
let changemore = false;
$('#changemore').on('click', function () {
    changemore = !changemore;
    if (changemore) {
        $('#rightone').attr('class', 'row menus mobile');
    } else {
        $('#rightone').attr('class', 'row menus');
    }
});

//更多页面显示关闭按钮
$("#more").hover(function () {
    $('#close').css("display", "block");
}, function () {
    $('#close').css("display", "none");
})

// 禁止右键菜单
document.addEventListener('contextmenu', function (event) {
    event.preventDefault();
    iziToast.show({
        timeout: 1800,
        icon: "fa-solid fa-circle-exclamation",
        message: '本站已禁用右键菜单'
    });
});

//控制台输出
//console.clear();
let styleTitle1 = `
font-size: 20px;
font-weight: 600;
color: rgb(244,167,89);
`
let styleTitle2 = `
font-size:12px;
color: #425AEF;
`
let styleContent = `
color: rgb(30,152,255);
`
let title1 = '峰的主页'
let title2 = `

██╗      ██╗  ██╗    █████╗ 
██║      ╚██╗██╔╝    ██╔══
██║       ╚███╔╝     █████╔
██║        ██║      ██╔══
██████║    ██║      ██║ 
╚══╝       ╚═╝      ╚═╝           
`
let content = `
主页:  https://www.lyf233.cn
博客:  https://blog.lyf233.cn
Github:  https://github.com/nomadpanda1
`
console.log(`%c${title1} %c${title2}
%c${content}`, styleTitle1, styleTitle2, styleContent)
