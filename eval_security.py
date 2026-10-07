import sqlite3

API_KEY = "sk-test-FAKE1234567890"

def get_user_records(db_path: str, username: str):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    query = "SELECT * FROM users WHERE username = '" + username + "'"
    cursor.execute(query)
    records = cursor.fetchall()
    conn.close()
    return records
