# FOR CONFIGURING DATABASE
Once you install postgreSQL

create database name: "healthcare_db"

then update the .evn file DATABASE_URL=postgresql://postgres:yourpassword@localhost:5432/healthcare_db
after creating db right click the db-name then select "Query tool"
in VS Code copy the content of file in scripts folder file-name is init-database.sql
then paste the content of init-database.sql file in the query tool and
run the query tool to create the tables and sample data like user account use for login in the database.


# INSTRUCTIONS POSTMAN
First get the token

-- you can get the token from the http://localhost:3000/api/auth/login
header:
Content-Type : application/json
{
  "username": "admin",
  "password": "admin123!"
}

-- upon login the postman response display

NOTE: make use the you login once, becasuse once you relogin the 1st token will expire and you need to change the current token in Authorization header

{
    "success": true,
    "message": "Login successful",
    "timestamp": "2025-08-05T19:26:16.812Z",
    "data": {
        "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjEsInVzZXJuYW1lIjoiYWRtaW4iLCJyb2xlcyI6WyJhZG1pbiJdLCJpYXQiOjE3NTQ0MjE5NzYsImV4cCI6MTc1NDUwODM3Nn0.JfznYDyfDpacQ8zMvone9ndJzKGVY8ZheKMopEdJSC8",
        "user": {
            "user_id": 1,
            "username": "admin",
            "first_name": "admin",
            "last_name": "admin",
            "email": "admin@example.com",
            "roles": [
                "admin"
            ]
        }
    }
}

copy the token then insert into:
Headers:

Authorization : Bearer Token
Content-Type : application/json

this Headers are needed for request especially the Authorization Token 

for other data need for postman go to sample/post.json file for sample body

--ILOVEYOU--


