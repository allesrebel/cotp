var process_copt = false;
var cached_security_info = undefined;

async function processSecurityInfo(details) {
	try 
	{
		const securityInfo = await browser.webRequest.getSecurityInfo(details.requestId,{});
		if (typeof securityInfo === "undefined") 
		{
			return;
		}

		cached_security_info = securityInfo;

		// Determine if we should even attempt to do a COTP pass
		for( let item of details.responseHeaders )
		{
			if( item.name == 'COTP_secret')
			{
				console.log("Secret: " + item.value);
				process_copt = item.value;
				break;
			}
		}

	}
	catch(error) 
	{
		console.error(error);
	}
}

function process_RTT(changes) {
	// Don't process unless we have been signaled too
	if ( process_copt == false ) return;

	let changedItems = Object.keys(changes);

	for (let item of changedItems) 
	{
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
			var corrected_rtt = Math.floor(changes[item].newValue['tcp_rtt'] / 7);

			// Create message to sign using shared secret TODO: FIX TCP_RTT
			var message = String(time_frame) + String(cipher_suite) + String(protocol_version) + String(corrected_rtt);
			const message_buf = new ArrayBuffer(message.length);
			const message_view = new Uint8Array(message_buf);
			message_view.set(message.split('').map(char => char.charCodeAt(0)));

			// calculate the COTP, for this window (and prev one )
			const buf = new ArrayBuffer(32);
			const secret = new Uint8Array(buf);
			// TODO: Make this User Fillable later
			secret.set("helloworld".split('').map(char => char.charCodeAt(0)));
			console.log(secret);
			console.log(message_view);

			window.crypto.subtle.importKey(
				"raw",
				secret,
				{
					name: "HMAC",
					hash: {name: "SHA-1"}
				},
				true,
				["sign"]
			).then(
				(key) => {
					window.crypto.subtle.sign(
						{
							name: "HMAC",
							hash: {name: "SHA-1"}
						},
						key,
						message_view
					).then(
						(signature) => 
						{
							let signature_view = new Uint8Array(signature);

							var offset = signature_view[19] & 0xf;
							var key_byte = (signature_view[offset] & 0x7f) << 24 | (signature_view[offset + 1] & 0xff) << 16 | (signature_view[offset + 2] & 0xff) << 8 | (signature_view[offset + 3] & 0xff);
							key_byte = "" + key_byte;
							key_byte = key_byte.substr(key_byte.length - 6, 6);

							let cotp =
							{
								cotp: key_byte
							};

							// Prepare to start the process, by sending
							// the cotp to the foreground thread to
							// display the cotp
							function setItem() 
							{
								console.log("Sending COTP to Foreground");
							}

							function onError(error) 
							{
								console.log(error)
							}

							// store the object
							browser.storage.local.set({cotp}).then(setItem, onError);
							console.log(signature_view)
						}
					)
				} 
			);
		}
	}
}

browser.storage.local.onChanged.addListener(process_RTT);

browser.webRequest.onHeadersReceived.addListener(
	processSecurityInfo,
	{urls: ["https://*/*"]}, 
	["blocking", "responseHeaders"]
);
