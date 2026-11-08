CREATE TABLE dict_visits (
  id BIGSERIAL PRIMARY KEY,
  t BIGINT NOT NULL,
  day TEXT NOT NULL,
  kind TEXT NOT NULL,
  ref TEXT NOT NULL DEFAULT '',
  who TEXT NOT NULL,
  src TEXT NOT NULL DEFAULT ''
);
CREATE INDEX dict_visits_day ON dict_visits (day);
