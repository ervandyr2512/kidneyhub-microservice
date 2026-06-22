CREATE TABLE IF NOT EXISTS donors (
    id           SERIAL PRIMARY KEY,
    name         VARCHAR(100) NOT NULL,
    age          INTEGER NOT NULL CHECK (age >= 18 AND age <= 65),
    blood_type   VARCHAR(5)  NOT NULL,
    city         VARCHAR(100),
    phone        VARCHAR(20),
    registered_by VARCHAR(50) DEFAULT 'system',
    status       VARCHAR(20) DEFAULT 'pending',
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
