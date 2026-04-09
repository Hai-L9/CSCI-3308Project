# Lab 10 UAT

## Test Environment
All tests run locally at `http://localhost:3000` using Docker (`docker compose up`)

## Implemented and Working Features

### User Registration

**User:** Unregistered user
**Test Case:** Fill out the registration form with a username, email, and password, then submit
**Test Data:**
- Username: `test`
- Email: `test@test.com`
- Password: `12345`
**Expected Result:** Account is created, user is redirected
**Actual Result:** Account was stored in the db


### User Login

**User:** Registered user
**Test Case:** Enter valid login and submit
**Test Data:**
- Username: `test`
- Password: `12345`
**Expected Result:** User is logged in to session and redirected to the home page
**Actual Result:** Home page loads with the user's session


### Login Fails with Wrong Password

**User:** Registered user
**Test Case:** Enter correct username but a wrong password
**Test Data:**
- Username: `test`
- Password: `12345`
**Expected Result:** Login fails and page shows error message
**Actual Result:** No user login and 401 error code


### Login Fails with Wrong Email

**User:** Registered user
**Test Case:** Enter an email that doesn't exist
**Test Data:**
- Email: `test@test.com`
- Password: `12345`
**Expected Result:** Login fails and page shows error message
**Actual Result:** No user login and 401 error code
