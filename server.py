#!/usr/bin/env python3
# A web server to echo back a request's headers and data.
# TODO: Add in Argument Parser

##
# A local database to perserve registered users
# Schemea is simply going to be
# id:int (primary key), user_token:str, shared_secret:str
#
# To keep things as simple as possible, users will
# be added manually via script. Then upon click from
# the user, a shared secret will be made only if they
# don't have one saved in the database.
# This shared secret will be saved in their auth
# application like anyother secret. 
#   -> User goes to QR Code/Secret Entry Page
# If user already has secret stored in DB, then 
# the secret is used along with other factors to 
# generate a connection-based one time passcode
#   -> User goes to continue screen, with passcode presented
##
import sqlite3
con = sqlite3.connect('website.db')

# Check if we have a table
table_check = "SELECT name FROM sqlite_master WHERE type='table' AND name='users';"

# Create the table, it doesn't exist
con.execute("""
create table if not exists users
(
    id int,
    user_token unqiue varchar(32) not null,
    shared_secret varchar(32),
    primary key (id)
);
""")
# TODO: replace with sqlite
db = {}

##
# The actual webserver part
## 
from http.server import HTTPServer, SimpleHTTPRequestHandler, HTTPStatus
from urllib.parse import urlparse
import re

class HTTPHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        forwarded_headers = self.headers['Forwarded'].split(';')
        forwarded_headers_dictionary = {}
        for header in forwarded_headers:
            key, value = header.split('=')
            forwarded_headers_dictionary[key] = value

        print(self.headers)
        # update self path so SimpleHTTPRequestHeader can do
        # the file look up!
        # We'll do a VERY simple router, if root or index, we point
        # index.html in the html folder
        if 'index' in forwarded_headers_dictionary['uri'] or '/' == forwarded_headers_dictionary['uri']:
            self.path = 'html/index.html'
            return super().do_GET()

        # Check if we were given a user token
        elif len(re.split(r'\/|\?|\=', self.path)) == 2:
            user = forwarded_headers_dictionary['uri'].split('/')[1]
            # check if the user already has a secret
            # Print the table contents
            print('checking db', db)
            if user in db:
            #for row in con.execute(f"select shared_secret from users where 'user_token' = '{user}';"):
                print("got something! makeing server COTP")
                self.send_response(200)
                self.send_header("COTP_secret", "true")
                self.end_headers()
                #self.wfile.write(b'Server Generated COTP') #TODO: maybe make a better 404 page?
                return
            else:
                # we didn't get a db hit, let's let the client know they
                # can register a shared secret
                self.send_response(HTTPStatus.OK)
                r = """
                \n
                <html>
                <body>
                <form>
                    <label for='secret'>Secret</label> 
                    <input name='secret'>
                    <input type='submit'>
                </form>
                </body>
                </html>
                \n
                """
                self.send_header("COTP_secret", "false")
                self.send_header("Content-type", "text/html")
                self.send_header("Content-length", str(len(r)))
                self.end_headers()
                self.wfile.write(bytes(r,'utf-8'))
                return

        elif ( len( re.split(r'\/|\?|\=', self.path) )  == 4 ):
            [_, user, _, secret] = re.split(r'\/|\?|\=', self.path)
            print( f"Saving to DB, {user} = {secret}" )
            db[user] = secret
            print(db)
            #con.execute(f"insert into users(user_token, shared_secret) values ('{user}', '{secret}');")
            # Redirect to URI (without password)
            r = """
            <html>
              <head>
                <meta http-equiv="refresh" content="0;url={}" />
              </head>
            </html>
            """.format(forwarded_headers_dictionary['uri'])
            self.send_response(200)
            self.end_headers()
            self.wfile.write(bytes(r, 'utf-8'))
            return
        
        
        # we didn't git a token, so we just return 404
        self.send_response(404)
        self.end_headers()
        self.wfile.write(b'Page Not Found') #TODO: maybe make a better 404 page?

    def do_POST(self):
        query = urlparse(self.path).query
        content_length = int(self.headers.get('content-length', 0))
        body = self.rfile.read(content_length)
        print(content_length)
        print(query)
        print(body)
        return 


print('About to listen on http://localhost:8000')
http_server = HTTPServer(('localhost', 8000), HTTPHandler)
http_server.serve_forever()
