var versionIconMap = new Map();
versionIconMap.set('TLSv1.3', 'icons/tlsv13.png');
versionIconMap.set('TLSv1.2', 'icons/tlsv12.png');
versionIconMap.set('TLSv1.1', 'icons/tlsv11.png');
versionIconMap.set('TLSv1', 'icons/tlsv10.png');
versionIconMap.set('unknown', 'icons/tlsunknown.png');

var versionIconWarningMap = new Map();
versionIconWarningMap.set('TLSv1.3', 'icons/tlsv13_warning.png');
versionIconWarningMap.set('TLSv1.2', 'icons/tlsv12_warning.png');
versionIconWarningMap.set('TLSv1.1', 'icons/tlsv11_warning.png');
versionIconWarningMap.set('TLSv1', 'icons/tlsv10_warning.png');

var versionComparisonMap = new Map();
versionComparisonMap.set('TLSv1.3', 13);
versionComparisonMap.set('TLSv1.2', 12);
versionComparisonMap.set('TLSv1.1', 11);
versionComparisonMap.set('TLSv1', 10);
versionComparisonMap.set('unknown', 0);

var tabMainProtocolMap = new Map();
var tabMainDowngradedMap = new Map();
var tabSubresourceProtocolMap = new Map();

var translationElementMap = new Map();
translationElementMap.set("popupTitleResources", "popup-button-resources-text");

async function detectTheme() {
    var themeInfo = await browser.theme.getCurrent();
    if (themeInfo.colors && themeInfo.colors.icons === "rgb(249, 249, 250, 0.7)") {
        versionIconMap.set('TLSv1.3', 'icons/tlsv13_dark.png');
        versionIconWarningMap.set('TLSv1.3', 'icons/tlsv13_dark_warning.png');
    } else {
        versionIconMap.set('TLSv1.3', 'icons/tlsv13.png');
        versionIconWarningMap.set('TLSv1.3', 'icons/tlsv13_warning.png');
    }
}

detectTheme();


async function updateIcon(tabId, protocolVersion, warning) {
    if (!protocolVersion) {
        if (tabId >= 0) {
            browser.pageAction.setTitle({ tabId: tabId, title: browser.i18n.getMessage('clearCache') });
        }
    } else {
        if (warning) {
            browser.pageAction.setIcon({
                tabId: tabId, path: versionIconWarningMap.get(protocolVersion)
            });
        } else {
            browser.pageAction.setIcon({
                tabId: tabId, path: versionIconMap.get(protocolVersion)
            });
        }
        browser.pageAction.setTitle({ tabId: tabId, title: protocolVersion});
        browser.pageAction.setPopup({tabId: tabId, popup: "/popup/popup.html"});
    }
}

async function loadSavedSecurityInfoAndUpdateIcon(details)
{
    const securityInfo = tabMainProtocolMap.get(details.tabId);
    cached_version = securityInfo ? securityInfo.protocolVersion : undefined;

    if (typeof cached_version !== "undefined" && cached_version !== "unknown") {
        if (tabMainDowngradedMap.has(details.tabId)) {
            await updateIcon(details.tabId, cached_version, tabMainDowngradedMap.get(details.tabId));
        } else {
            await updateIcon(details.tabId, cached_version, false);
        }
    } else {
        await updateIcon(details.tabId, undefined, false);
    }
}

function getSubresourceMap(tabId) {
    if (!tabSubresourceProtocolMap.has(tabId)) {
        tabSubresourceProtocolMap.set(tabId, new Map());
    }
    var subresourceMap = tabSubresourceProtocolMap.get(tabId);
    return subresourceMap;
}

var process_copt = false;
var cached_security_info = undefined;

async function processSecurityInfo(details) {
    try {
        const securityInfo = await browser.webRequest.getSecurityInfo(details.requestId,{});
        if (typeof securityInfo === "undefined") {
            return;
        }

        cached_security_info = securityInfo;

        // Determine if we should even attempt to do a COTP pass
        for( item in details.responseHeaders )
        {
            if(details.responseHeaders[item] == 'COTP_secret')
            {
                console.log("Secret: " + details.responseHeaders[item].COTP_secret);
                process_copt = details.responseHeaders[item].COTP_secret;
            }
        }

        // save the security info for the current tab and update the page action icon
        if (details.type === 'main_frame') {
            tabMainProtocolMap.set(details.tabId, securityInfo);
            tabMainDowngradedMap.set(details.tabId, false);
            await updateIcon(details.tabId, securityInfo.protocolVersion, false);
        }

        // save the security info for third party hosts that were loaded within
        // the current tab
        const host = (new URL(details.url)).host;
        var subresourceMap = getSubresourceMap(details.tabId);
        subresourceMap.set(host, securityInfo);
        tabSubresourceProtocolMap.set(details.tabId, subresourceMap);

        var mainProtocolVersion = versionComparisonMap.get(tabMainProtocolMap.get(details.tabId).protocolVersion);
        for (const securityInfo of subresourceMap.values()) {
            if (versionComparisonMap.get(securityInfo.protocolVersion) < mainProtocolVersion) {
                tabMainDowngradedMap.set(details.tabId, true);
                await updateIcon(details.tabId, tabMainProtocolMap.get(details.tabId).protocolVersion, true);
                break;
            }
        }

    } catch(error) {
        console.error(error);
    }
}

// clear security info when navigating to a different URL
function handleNavigation(details) {
    tabSubresourceProtocolMap.set(details.tabId, new Map());
}

// extension internal event handling to pass information from
// background to page action ("foreground")
function handleMessage(request, sender, sendResponse) {
    var response;
    try {
        switch (request.type) {
            case 'request':
                const is_undefined = typeof request.key === 'undefined';
                if (request.resource === 'tabSubresourceProtocolMap') {
                    response = {
                        requested_info: is_undefined ? tabSubresourceProtocolMap : tabSubresourceProtocolMap.get(request.key)
                    };
                } else if (request.resource === 'tabMainProtocolMap') {
                    response = {
                        requested_info: is_undefined ? tabMainProtocolMap : tabMainProtocolMap.get(request.key)
                    };
                } else if (request.resource === 'versionComparisonMap') {
                    response = {
                        requested_info: is_undefined ? versionComparisonMap : versionComparisonMap.get(request.key)
                    };
                } else {
                    response = new Error(browser.i18n.getMessage('invalidResourceRequest'));
                }
                break;
            default:
                response = new Error(browser.i18n.getMessage('invalidMessageRequest'));
        }
    } catch (error) {
        response = error;
    }
    sendResponse(response);
}

function process_RTT(changes) {

  // Don't process unless we have been signaled too
  if ( process_copt == false ) return;

  let changedItems = Object.keys(changes);

  for (let item of changedItems) {
    if( item == "tcp_rtt_data" && changes[item].newValue['tcp_rtt'] != 0)
    {
        console.log(changes[item].newValue['tcp_rtt']);
        
        // Do the Actual COTP Algo

        // Pull in time frame
        var time_now = Math.round( new Date().getTime() / 1000.0 );
        var time_frame = Math.floor( time_now / 30 );

        // extract out cipher suite + tcp RTT
        var cipher_suite = cached_security_info.cipherSuite;
        var protocol_version = cached_security_info.protocolVersion;
        var rtt = changes[item].newValue['tcp_rtt'];

        // Create message to sign using shared secret
        var message = String(time_frame) + String(cipher_suite) + String(protocol_version) + String(rtt)

        console.log( message );

        let cotp = {
            cotp: message
        };

        // Prepare to start the process, by sending
        // the cotp to the foreground thread to
        // display the cotp
        function setItem() {
          console.log("Sending COTP to Foreground");
        }

        function onError(error) {
          console.log(error)
        }

        // store the object
        browser.storage.local.set({cotp}).then(setItem, onError);
    }
  }
}

browser.storage.local.onChanged.addListener(process_RTT);


browser.webRequest.onHeadersReceived.addListener(processSecurityInfo,
    {urls: ["https://*/*"]}, ["blocking", "responseHeaders"]
);

browser.webRequest.onCompleted.addListener(loadSavedSecurityInfoAndUpdateIcon,
    {urls: ["https://*/*"]}
);

browser.webNavigation.onBeforeNavigate.addListener(handleNavigation,
    {url: [{schemes: ["https"]} ]}
);

browser.runtime.onMessage.addListener(handleMessage);

browser.theme.onUpdated.addListener(detectTheme);
