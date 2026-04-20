const server = require('../index');
const jwt = require('jsonwebtoken');
const db = require('../src/resources/db');

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
  after(done => {
    db.none('DELETE FROM users WHERE email = ANY($1)', [[`user${TS}@test.com`, `dup${TS}@test.com`]])
      .then(() => done()).catch(done);
  });

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

  it('Returns 409 for a duplicate user', done => {
    const payload = { username: `dup${TS}`, email: `dup${TS}@test.com`, password: 'password123' };
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

  after(done => {
    db.none('DELETE FROM users WHERE email = $1', [loginUser.email])
      .then(() => done()).catch(done);
  });

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

  after(done => {
    db.none('DELETE FROM users WHERE email = $1', [`getuser${TS}@test.com`])
      .then(() => done()).catch(done);
  });

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

  it('Returns 401 when no token is provided', done => {
    chai
      .request(server)
      .get('/api/auth/get-user')
      .end((err, res) => {
        expect(res).to.have.status(401);
        done();
      });
  });

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

// ---- Config API ----

describe('Config API', () => {
  it('Returns 200 with a googleMapsKey field', done => {
    chai
      .request(server)
      .get('/api/config')
      .end((err, res) => {
        expect(res).to.have.status(200);
        expect(res.body).to.have.property('googleMapsKey');
        done();
      });
  });
});

// ---- Service Status API ----

describe('Service Status API', () => {
  it('Returns a status object with service health details', done => {
    chai
      .request(server)
      .get('/api/service-status')
      .end((err, res) => {
        expect(res.status).to.be.oneOf([200, 503]);
        expect(res.body).to.have.property('status');
        expect(res.body).to.have.property('services');
        expect(res.body.services).to.have.property('database');
        done();
      });
  });
});

// ---- Worksites API ----

describe('Worksites API', () => {
  after(done => {
    db.none('DELETE FROM worksites WHERE name = ANY($1)', [[`Test Worksite ${TS}`, `DB Test Worksite ${TS}`]])
      .then(() => done()).catch(done);
  });

  it('Returns 201 and an id when creating a valid worksite', done => {
    chai
      .request(server)
      .post('/api/worksites')
      .send({ name: `Test Worksite ${TS}`, address: '123 Main St', lat: 39.7392, lng: -104.9903 })
      .end((err, res) => {
        expect(res).to.have.status(201);
        expect(res.body).to.have.property('id');
        done();
      });
  });

  it('Returns 400 when name is missing', done => {
    chai
      .request(server)
      .post('/api/worksites')
      .send({ lat: 39.7392, lng: -104.9903 })
      .end((err, res) => {
        expect(res).to.have.status(400);
        done();
      });
  });

  it('Returns 200 and an array from GET /api/worksites', done => {
    chai
      .request(server)
      .get('/api/worksites')
      .end((err, res) => {
        expect(res).to.have.status(200);
        expect(res.body).to.be.an('array');
        done();
      });
  });

  it('Created worksite appears in GET /api/worksites with correct lat/lng', done => {
    const name = `DB Test Worksite ${TS}`;
    chai.request(server)
      .post('/api/worksites')
      .send({ name, lat: 40.0150, lng: -105.2705 })
      .end((err, res) => {
        expect(res).to.have.status(201);
        const id = res.body.id;
        chai.request(server)
          .get('/api/worksites')
          .end((err2, res2) => {
            expect(res2).to.have.status(200);
            const created = res2.body.find(w => w.id === id);
            expect(created).to.exist;
            expect(parseFloat(created.lat)).to.be.closeTo(40.0150, 0.0001);
            expect(parseFloat(created.lng)).to.be.closeTo(-105.2705, 0.0001);
            done();
          });
      });
  });
});

// ---- Tasks API ----

describe('Tasks API', () => {
  let managerToken;

  before(done => {
    // Register a real user so created_by FK is satisfied, then mint a manager token with their ID
    const user = { username: `taskuser${TS}`, email: `taskuser${TS}@test.com`, password: 'password123' };
    chai.request(server).post('/api/auth/register').send(user).end((err, res) => {
      const userId = res.body.user.id;
      managerToken = jwt.sign({ id: userId, role: 'manager' }, process.env.JWT_SECRET, { expiresIn: '1h' });
      done();
    });
  });

  after(done => {
    db.none(`DELETE FROM tasks WHERE title LIKE $1`, [`%${TS}`])
      .then(() => db.none('DELETE FROM users WHERE email = $1', [`taskuser${TS}@test.com`]))
      .then(() => done()).catch(done);
  });

  it('Returns 200 and an array from GET /api/tasks', done => {
    chai
      .request(server)
      .get('/api/tasks')
      .set('Authorization', `Bearer ${managerToken}`)
      .end((err, res) => {
        expect(res).to.have.status(200);
        expect(res.body).to.be.an('array');
        done();
      });
  });

  it('Returns 201 and an id when creating a valid task', done => {
    chai
      .request(server)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ title: `Test Task ${TS}`, status: 'backlog', priority: 'medium' })
      .end((err, res) => {
        expect(res).to.have.status(201);
        expect(res.body).to.have.property('id');
        done();
      });
  });

  it('Created task appears in GET /api/tasks', done => {
    const title = `Visible Task ${TS}`;
    chai.request(server)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ title, status: 'in-progress', priority: 'high' })
      .end((err, res) => {
        expect(res).to.have.status(201);
        chai.request(server)
          .get('/api/tasks')
          .set('Authorization', `Bearer ${managerToken}`)
          .end((err2, res2) => {
            expect(res2).to.have.status(200);
            expect(res2.body.some(t => t.title === title)).to.be.true;
            done();
          });
      });
  });

  it('Returns 200 when updating an existing task', done => {
    chai.request(server)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ title: `Patch Me ${TS}`, status: 'backlog', priority: 'low' })
      .end((err, res) => {
        expect(res).to.have.status(201);
        const id = res.body.id;
        chai.request(server)
          .patch(`/api/tasks/${id}`)
          .set('Authorization', `Bearer ${managerToken}`)
          .send({ title: `Patch Me ${TS}`, status: 'in-progress', priority: 'high' })
          .end((err2, res2) => {
            expect(res2).to.have.status(200);
            expect(res2.body.success).to.be.true;
            done();
          });
      });
  });

  it('Returns 404 when updating a non-existent task', done => {
    chai
      .request(server)
      .patch('/api/tasks/999999')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ title: 'ghost', status: 'backlog', priority: 'low' })
      .end((err, res) => {
        expect(res).to.have.status(404);
        done();
      });
  });

  it('Returns 200 and an array from GET /api/tasks/map', done => {
    chai
      .request(server)
      .get('/api/tasks/map')
      .set('Authorization', `Bearer ${managerToken}`)
      .end((err, res) => {
        expect(res).to.have.status(200);
        expect(res.body).to.be.an('array');
        done();
      });
  });

  it('Returns 200 and an array from GET /api/tasks/:id/worksite-history', done => {
    chai.request(server)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ title: `History Task ${TS}`, status: 'backlog', priority: 'low' })
      .end((err, res) => {
        expect(res).to.have.status(201);
        const id = res.body.id;
        chai.request(server)
          .get(`/api/tasks/${id}/worksite-history`)
          .set('Authorization', `Bearer ${managerToken}`)
          .end((err2, res2) => {
            expect(res2).to.have.status(200);
            expect(res2.body).to.be.an('array');
            done();
          });
      });
  });

  it('Returns 204 when deleting an existing task', done => {
    chai.request(server)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ title: `Delete Me ${TS}`, status: 'backlog', priority: 'low' })
      .end((err, res) => {
        expect(res).to.have.status(201);
        const id = res.body.id;
        chai.request(server)
          .delete(`/api/tasks/${id}`)
          .set('Authorization', `Bearer ${managerToken}`)
          .end((err2, res2) => {
            expect(res2).to.have.status(204);
            done();
          });
      });
  });

  it('Returns 404 when deleting a non-existent task', done => {
    chai
      .request(server)
      .delete('/api/tasks/999999')
      .set('Authorization', `Bearer ${managerToken}`)
      .end((err, res) => {
        expect(res).to.have.status(404);
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

  after(done => {
    // email doesn't change, so this always finds the user even after username update
    db.none('DELETE FROM users WHERE email = $1', [`updateuser${TS}@test.com`])
      .then(() => done()).catch(done);
  });

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

  it('Returns 401 when no token is provided', done => {
    chai
      .request(server)
      .patch('/api/auth/update-user')
      .send({ username: 'noToken' })
      .end((err, res) => {
        expect(res).to.have.status(401);
        done();
      });
  });
});
