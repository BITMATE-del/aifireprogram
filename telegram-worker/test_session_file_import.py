"""Offline round-trip test; uses fake random auth bytes, never a real account."""
import base64
import os
import tempfile
from telethon.crypto import AuthKey
from telethon.sessions import SQLiteSession, StringSession
from session_file_import import convert_sqlite_session

def test_sqlite_conversion():
    with tempfile.TemporaryDirectory() as root:
        path=os.path.join(root,"test")
        initial=SQLiteSession(path)
        try:
            initial.set_dc(2,"149.154.167.50",443)
            fake_key=os.urandom(256)
            initial.auth_key=AuthKey(data=fake_key)
            initial.save()
        finally:
            initial.close()
        with open(path+".session","rb") as file:
            content=file.read()
        converted=convert_sqlite_session(base64.b64encode(content).decode("ascii"))
        assert converted.startswith("1"), "Invalid exported StringSession version"
        assert StringSession(converted).auth_key.key==fake_key, "Auth key changed during conversion"
        print("PASS: Telethon .session SQLite -> StringSession conversion")
        try:
            convert_sqlite_session(base64.b64encode(b"not a session").decode("ascii"))
        except ValueError:
            print("PASS: invalid file rejected")
        else:
            raise AssertionError("Malformed session file should have been rejected")

if __name__=="__main__":
    test_sqlite_conversion()
