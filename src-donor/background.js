var localStore = chrome.storage.local;

(function() {
    var price = 0, prevPrice = 0, up = true, toggle = false;

    function formatPrice(value) {
        if (!toggle) {
            if (value >= 1000) {
                value = parseInt(value);
                var suffixes = ["", "k", "m", "b", "t"];
                var suffixNum = Math.floor(("" + value).length / 3);
                var shortValue = '';
                for (var precision = 2; precision >= 1; precision--) {
                    shortValue = parseFloat((suffixNum != 0 ? (value / Math.pow(1000, suffixNum)) : value).toPrecision(precision));
                    var dotLessShortValue = (shortValue + '').replace(/[^a-zA-Z 0-9]+/g, '');
                    if (dotLessShortValue.length <= 2) {
                        break;
                    }
                }
                if (shortValue % 1 != 0) shortValue = shortValue.toFixed(1);
                return shortValue + suffixes[suffixNum];
            } else {
                if (value < 10) return value.toFixed(2);
                else if (value < 100) return value.toFixed(1);
                else return parseInt(value);
            }
        }
        return price;
    }

    function setToggle(ans) {
        localStore.set({
            ["toggle"]: ans
        });
        toggle = ans;
    }

    function updateBadge() {
        localStore.get(['toggle'], (item) => toggle = item.toggle);

        fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd')
            .then(response => response.text())
            .then(data => {
                let dataObj = JSON.parse(data);
                price = dataObj['bitcoin'].usd;
                chrome.action.setBadgeText({
                    text: formatPrice(price).toString()
                });
                chrome.action.setTitle({
                    title: String(price)
                });
                if (price >= prevPrice) {
                    setupBadge(up);
                } else {
                    setupBadge(!up);
                }
                prevPrice = price;
            })
            .catch(error => {
                console.log("error", error);
                chrome.action.setBadgeText({
                    text: "x_x"
                });
                chrome.action.setTitle({
                    title: String(error)
                });
            });
    }

    function setupAlarm() {
        chrome.alarms.create('updateBadgeAlarm', {
            periodInMinutes: 1 // Run every 1 minute
        });
    }

    function setupBadge(up) {
        if (up) {
            setTimeout(function() {
                chrome.action.setBadgeBackgroundColor({
                    color: "#009E73"
                });
            }, 1000);
        } else {
            setTimeout(function() {
                chrome.action.setBadgeBackgroundColor({
                    color: "#ff0000"
                });
            }, 1000);
        }
        chrome.action.setBadgeBackgroundColor({
            color: "#f9a43f"
        });
    }

    chrome.action.onClicked.addListener(function(tab) {
        setToggle(!toggle);
        updateBadge();
    });

    chrome.alarms.onAlarm.addListener(function(alarm) {
        if (alarm.name === 'updateBadgeAlarm') {
            updateBadge();
        }
    });

    updateBadge();
    setupAlarm();
})();
