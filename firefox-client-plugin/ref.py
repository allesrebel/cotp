import hmac, base64, struct, hashlib, time

# Reference COTP Generation using
# default HOTP gen from RFC
# examples data pulled from live demo
tcp_rtt=20380
tls_proto='TLSv1.3'
tls_csuite='TLS_AES_128_GCM_SHA256'
secret = 'TESTTESTTEST====' # 16 chars

def get_hotp_token(secret, msg):
    key = base64.b32decode(secret, True)

    # secret -> just unsigned bytes
    msg_array = bytearray()
    msg_array.extend(map(ord, msg))

    # RFC says to use specific bytes
    h = hmac.new(key, msg_array, hashlib.sha1).digest()
    o = h[19] & 15

    #Generate a hash using HMAC SHA1
    # grab the first 3 bytes after 20th, undo endiness
    key_byte = struct.unpack(">I", h[o:o+4])[0]
    # convert key byte into a code
    htop = (key_byte & 0x7fffffff) % 1000000
    return htop

def get_cotp(secret):
    # gather 30s timeframe, from current time
    time_Frame = (int(time.time())//30)

    # grather/extract out cipher suite + tcp RTT
    cipher_suite = tls_csuite # IE TLS_AWS_128_GCM_SHA256
    protocol_version = tls_proto # IE TLS 1.3
    tcp_rtt_ms = ( tcp_rtt // 1000 ) # 34 microseconds

    # stick everything together
    msg = str(time_Frame) + str(cipher_suite) + str(protocol_version) + str(tcp_rtt_ms)

    #ensuring to give the same otp for 30 seconds
    cotp = str( get_hotp_token(secret, msg) )

    #adding 0 in the beginning till OTP has 6 digits
    while len(cotp) != 6 :
        cotp += '0'

    return cotp

print(get_cotp(secret))
