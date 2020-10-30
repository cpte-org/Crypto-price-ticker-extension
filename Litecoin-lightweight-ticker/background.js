var localStore = chrome.storage.local;
(function() {
    var price = 0;
    var prevPrice = 0;
    var up = true;
    var toggle = false;

    function formatPrice(value) {
        if(!toggle)
            if(value >=1000){
                value=parseInt(value);
                var suffixes = ["", "k", "m", "b","t"];
                var suffixNum = Math.floor( (""+value).length/3 );
                var shortValue = '';
                for (var precision = 2; precision >= 1; precision--) {
                    shortValue = parseFloat( (suffixNum != 0 ? (value / Math.pow(1000,suffixNum) ) : value).toPrecision(precision));
                    var dotLessShortValue = (shortValue + '').replace(/[^a-zA-Z 0-9]+/g,'');
                    if (dotLessShortValue.length <= 2) { break; }
                }
                if (shortValue % 1 != 0)  shortValue = shortValue.toFixed(1);
                return shortValue+suffixes[suffixNum];
            }else{
                if (value <10) return value.toFixed(2);
                else if (value <100) return value.toFixed(1);
                else return parseInt(value);
            }
        return price; 
    }

    function changeMode() {
        switch (toggle) {
            case true:
                localStore.set({
                    ["toggle"]: false
                });
                toggle = false;
                break;
            case false:
                localStore.set({
                    ["toggle"]: true
                });
                toggle = true;
                break;
            default:
                localStore.set({
                    ["toggle"]: true
                });
                toggle = true;
                break;
        }
        updateBadgeText(price);
    }

    function updateBadgeText(price) {

        chrome.browserAction.setBadgeText({
            text: formatPrice(price).toString()
        });
        chrome.browserAction.setTitle({
            title: String(price)
        });
    }


    function updateBadge() {
        localStore.get(['toggle'], (item) =>toggle = item.toggle);

        var xhr = new XMLHttpRequest();
        xhr.open("GET", "https://api.coingecko.com/api/v3/simple/price?ids=litecoin&vs_currencies=usd", true);
        xhr.onreadystatechange = function() {
            if (xhr.readyState == 4 && xhr.status == 200) {
                var response = JSON.parse(xhr.responseText);
                price = response['litecoin'].usd;
                updateBadgeText(price);
            }
            if (price >= prevPrice) {
                setupBadge(up);
            } else {
                setupBadge(!up);
            }
            prevPrice = price;
        };
        xhr.send();
    }

    function setupInterval() {
        window.setInterval(function() {
            updateBadge();
        }, 10000);
    }

    function setupBadge(up) {
        if (up) {
            setTimeout(function() {
                chrome.browserAction.setBadgeBackgroundColor({
                    color: "#009E73"
                });
            }, 1000);
        } else {
            setTimeout(function() {
                chrome.browserAction.setBadgeBackgroundColor({
                    color: "#ff0000"
                });
            }, 1000);
        }
        chrome.browserAction.setBadgeBackgroundColor({
            color: "#f9a43f"
        });

    }

    chrome.browserAction.onClicked.addListener(function(tab) {
        changeMode();
    });
    updateBadge();
    setupInterval();
})();
