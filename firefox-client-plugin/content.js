// Now that Page has loaded, we've injected this script into
// the web page.

// let's extract out RTT Timing for TCP
let p = window.performance.timing;
let rtt = p.secureConnectionStart - p.connectStart;
console.log("RTT Foreground: " + rtt);

// finally, lets send this to local storage
// allowing the background script to complete
let tcp_rtt_data = {
	tcp_rtt: rtt
}

// Set up Trigger, so we can print out the COTP once
// calculated by the background process/script
function process_cotp(changes) 
{
	let changedItems = Object.keys(changes);

	for (let item of changedItems) 
	{
		if( item == 'cotp')
		{
			console.log("COTP: " + changes[item].newValue['cotp']);
			let header = document.createElement('h1');
			header.textContent = "Browser Generated COTP = " + changes[item].newValue['cotp'];
			document.body.appendChild(header);
		}
	}
}

browser.storage.local.onChanged.addListener(process_cotp);


// Prepare to start the process, by sending
// the TCP_RTT to the background thread to
// compute the COTP!
function setItem() {
	console.log("TCP_RTT Sent to Storage");
}

function onError(error) {
	console.log(error)
}

// store the object
browser.storage.local.set({tcp_rtt_data}).then(setItem, onError);
