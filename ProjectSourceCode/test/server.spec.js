const server = require('../index');

const chai = require('chai');
const chaiHttp = require('chai-http');
chai.should();
chai.use(chaiHttp);
const { assert, expect } = chai;

const TS = Date.now();

// ---- Welcome ----

describe('Server!', () => {
  it('Returns the default welcome message', done => {
    chai
      .request(server)
      .get('/welcome')
      .end((err, res) => {
        expect(res).to.have.status(200);
        expect(res.body.status).to.equals('success');
        assert.strictEqual(res.body.message, 'Welcome!');
        done();
      });
  });
});

// ---- Session Persistence ----

describe('Session Persistence', () => {
  it('Persists session data across requests (visit counter increments)', done => {
    const agent = chai.request.agent(server);
    agent
      .get('/welcome')
      .end((err, res) => {
        expect(res).to.have.status(200);
        expect(res.body.visits).to.equal(1);
        agent
          .get('/welcome')
          .end((err2, res2) => {
            expect(res2).to.have.status(200);
            expect(res2.body.visits).to.equal(2);
            agent.close();
            done();
          });
      });
  });
});

// ---- Register API ----

describe('Register API', () => {
  // unique user 
  it('Returns 201 for a valid registration', done => {
    chai
      .request(server)
      .post('/api/auth/register')
      .send({ username: `user${TS}`, email: `user${TS}@test.com`, password: 'password123' })
      .end((err, res) => {
        expect(res).to.have.status(201);
        expect(res.body).to.have.property('token');
        expect(res.body.user).to.include.keys('id', 'username', 'email', 'role');
        done();
      });
  });

  // duplicate user
  it('Returns 409 for a duplicate user', done => {
    const payload = { username: `dup${TS}`, email: `dup${TS}@test.com`, password: 'password123' };
    // Register once, then again — second must always be 409
    chai.request(server).post('/api/auth/register').send(payload).end(() => {
      chai
        .request(server)
        .post('/api/auth/register')
        .send(payload)
        .end((err, res) => {
          expect(res).to.have.status(409);
          done();
        });
    });
  });

  // missing fields 
  it('Returns 400 when required fields are missing', done => {
    chai
      .request(server)
      .post('/api/auth/register')
      .send({})
      .end((err, res) => {
        expect(res).to.have.status(400);
        done();
      });
  });
});

// ---- Login API ----

describe('Login API', () => {
  const loginUser = { username: `login${TS}`, email: `login${TS}@test.com`, password: 'password123' };

  before(done => {
    chai.request(server).post('/api/auth/register').send(loginUser).end(() => done());
  });

  // Positive: valid credentials → 200 + token
  it('Returns 200 and a token for valid credentials', done => {
    chai
      .request(server)
      .post('/api/auth/login')
      .send({ email: loginUser.email, password: loginUser.password })
      .end((err, res) => {
        expect(res).to.have.status(200);
        expect(res.body).to.have.property('token');
        done();
      });
  });

  //  wrong password
  it('Returns 401 for invalid credentials', done => {
    chai
      .request(server)
      .post('/api/auth/login')
      .send({ email: loginUser.email, password: 'wrongpassword' })
      .end((err, res) => {
        expect(res).to.have.status(401);
        done();
      });
  });

  // missing fields
  it('Returns 400 when fields are missing', done => {
    chai
      .request(server)
      .post('/api/auth/login')
      .send({})
      .end((err, res) => {
        expect(res).to.have.status(400);
        done();
      });
  });
});

// ---- Get User API ----

describe('Get User API', () => {
  let token;

  before(done => {
    const user = { username: `getuser${TS}`, email: `getuser${TS}@test.com`, password: 'password123' };
    chai.request(server).post('/api/auth/register').send(user).end((err, res) => {
      token = res.body.token;
      done();
    });
  });

  // valid token
  it('Returns 200 with user data for a valid token', done => {
    chai
      .request(server)
      .get('/api/auth/get-user')
      .set('Authorization', `Bearer ${token}`)
      .end((err, res) => {
        expect(res).to.have.status(200);
        expect(res.body).to.have.property('user');
        done();
      });
  });

  // no token
  it('Returns 401 when no token is provided', done => {
    chai
      .request(server)
      .get('/api/auth/get-user')
      .end((err, res) => {
        expect(res).to.have.status(401);
        done();
      });
  });

  // malformed token
  it('Returns 401 for a malformed token', done => {
    chai
      .request(server)
      .get('/api/auth/get-user')
      .set('Authorization', 'Bearer this.is.garbage')
      .end((err, res) => {
        expect(res).to.have.status(401);
        done();
      });
  });
});

// ---- Update User API ----

describe('Update User API', () => {
  let token;

  before(done => {
    const user = { username: `updateuser${TS}`, email: `updateuser${TS}@test.com`, password: 'password123' };
    chai.request(server).post('/api/auth/register').send(user).end((err, res) => {
      token = res.body.token;
      done();
    });
  });

  // update username
  it('Returns 200 and updated user when username is changed', done => {
    chai
      .request(server)
      .patch('/api/auth/update-user')
      .set('Authorization', `Bearer ${token}`)
      .send({ username: `updated${TS}` })
      .end((err, res) => {
        expect(res).to.have.status(200);
        expect(res.body.user.username).to.equal(`updated${TS}`);
        done();
      });
  });

  // newPassword without currentPassword 
  it('Returns 400 when newPassword is provided without currentPassword', done => {
    chai
      .request(server)
      .patch('/api/auth/update-user')
      .set('Authorization', `Bearer ${token}`)
      .send({ newPassword: 'newpass123' })
      .end((err, res) => {
        expect(res).to.have.status(400);
        done();
      });
  });

  // wrong currentPassword 
  it('Returns 401 for incorrect currentPassword', done => {
    chai
      .request(server)
      .patch('/api/auth/update-user')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'wrongpass', newPassword: 'newpass123' })
      .end((err, res) => {
        expect(res).to.have.status(401);
        done();
      });
  });

  // no token
  it('Returns 401 when no token is provided', done => {
    chai
      .request(server)
      .patch('/api/auth/update-user')
      .send({ username: 'hacker' })
      .end((err, res) => {
        expect(res).to.have.status(401);
        done();
      });
  });
});

// ---- Extra Credit: Login API (additional cases) ----

describe('Login API — Extra Credit', () => {
  const ecUser = {
    username: `ec${TS}`,
    email:    `ec${TS}@test.com`,
    password: 'password123',
  };

  before(done => {
    // Register the test user once before these tests run
    chai.request(server)
      .post('/api/auth/register')
      .send(ecUser)
      .end(() => done());
  });

  // ---- Positive ----
  it('Returns 200 and a token when logging in with username instead of email', done => {
    chai
      .request(server)
      .post('/api/auth/login')
      .send({ username: ecUser.username, password: ecUser.password })  // username, not email
      .end((err, res) => {
        expect(res).to.have.status(200);
        expect(res.body).to.have.property('token');
        done();
      });
  });

  // ---- Negative ----
  it('Returns 401 (or 404) for a valid-format email that does not exist in the system', done => {
    chai
      .request(server)
      .post('/api/auth/login')
      .send({ email: `ghost${TS}@test.com`, password: 'password123' })  // email never registered
      .end((err, res) => {
        expect(res.status).to.be.oneOf([401, 404]); 
        done();
      });
  });
});
