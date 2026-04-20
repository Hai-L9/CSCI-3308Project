-- Default worker user: meow / meow@meow.com / password: meow
INSERT INTO users (username, email, password_hash, role)
VALUES ('test_worker', 'test_worker@meow.com', '$2b$10$12qYfJ6m1nvwaOC2m6glb.t7FNKTjCUPl5lbHO9MtGIybhoFz1tXy', 'worker')
ON CONFLICT DO NOTHING;

-- Default admin user: meowM / moewM@meow.com / password: meow
INSERT INTO users (username, email, password_hash, role)
VALUES ('meow', 'moew@meow.com', '$2b$10$12qYfJ6m1nvwaOC2m6glb.t7FNKTjCUPl5lbHO9MtGIybhoFz1tXy', 'admin')
ON CONFLICT DO NOTHING;
