SELECT
  COUNT(DISTINCT CASE WHEN name = 'visited' THEN session_id END) AS users,
  COUNT(DISTINCT CASE WHEN name = 'searched' THEN session_id END) AS searched,
  COUNT(DISTINCT CASE WHEN name = 'saved' THEN session_id END) AS saved,
  COUNT(DISTINCT CASE WHEN name = 'opened' THEN session_id END) AS opened,
  COUNT(DISTINCT CASE WHEN name = 'returned' THEN session_id END) AS returned,
  COUNT(DISTINCT CASE WHEN name = 'visited' AND occurred_on >= date('now', '-6 days') THEN session_id END) AS users_7d,
  COUNT(DISTINCT CASE WHEN name = 'opened' AND occurred_on >= date('now', '-6 days') THEN session_id END) AS opened_7d
FROM product_events;
