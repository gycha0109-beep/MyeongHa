SELECT count() AS "value"
FROM "logs"."workersLogs"
WHERE "accountTag" = '410d3f82ed3ccc66609a2b698803859b'
  AND "scriptName" = 'myeongha'
  AND "message" LIKE 'MYEONGHA_SECURITY_EVENT %'
  AND ("message" LIKE '%"eventCode":"ACCESS_DENIED"%'
       OR "message" LIKE '%"eventCode":"RATE_LIMITED"%')
