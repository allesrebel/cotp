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
    id int not null,
    user_token unqiue varchar(32) not null,
    shared_secret varchar(32),
    primary key (id)
);
""")

##
# The actual webserver part
## 
from http.server import HTTPServer, BaseHTTPRequestHandler

class HTTPHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.write_response(b'')

    def do_POST(self):
        content_length = int(self.headers.get('content-length', 0))
        body = self.rfile.read(content_length)

        self.write_response(body)

    def write_response(self, content):
        self.send_response(200)
        self.end_headers()
        self.wfile.write(content)

        print(self.headers)
        print(content.decode('utf-8'))

print('About to listen on http://localhost:8000')
http_server = HTTPServer(('localhost', 8000), HTTPHandler)
http_server.serve_forever()
