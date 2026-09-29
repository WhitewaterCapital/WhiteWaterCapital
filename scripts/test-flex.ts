// Offline test of the IBKR Flex parser + unit accounting against a fixture.
// Run: npm run test:flex
import { readFileSync } from "node:fs";
import { parseFlexStatement, flexDate, flexDateTime } from "../src/lib/broker/flex";
import { mapPositions, mapTrades, buildHistory, mapFlows } from "../src/lib/broker/ibkr";
import assert from "node:assert/strict";
const s = parseFlexStatement(readFileSync("scripts/fixtures/flex-sample.xml","utf8"));
assert.equal(s.accountId,"U1234567"); assert.equal(s.toDate,"2026-09-10");
const pos = mapPositions(s); 
assert.equal(pos.length,2); assert.equal(pos[0].symbol,"AAPL");
assert.ok(Math.abs(pos[1].marketValueUsd-3700.015)<0.01);
const tr = mapTrades(s); 
assert.equal(tr.length,3); assert.equal(tr[0].symbol,"MSFT"); assert.equal(tr[0].side,"sell"); assert.equal(tr[0].quantity,3);

const h = buildHistory(s); 
// Deposit of 5000 on 09-03 must not register as return: uv 10.10 -> 15200/(1000+5000/10.1)
assert.ok(Math.abs(h[1].unitValueUsd-10.1)<1e-9);
const units = 1000 + 5000/10.1; assert.ok(Math.abs(h[2].unitValueUsd - 15200/units)<1e-9);
assert.ok(h[2].unitValueUsd < 10.2 && h[2].unitValueUsd > 10.1);
assert.equal(flexDate("09/15/2026"),"2026-09-15"); assert.equal(flexDate("2026-09-15, 10:00:00"),"2026-09-15");
assert.equal(flexDateTime("2026-09-15;10:30:15"),"2026-09-15T10:30:15");
// error response
assert.throws(()=>parseFlexStatement("<FlexStatementResponse><Status>Fail</Status><ErrorCode>1020</ErrorCode><ErrorMessage>Invalid request</ErrorMessage></FlexStatementResponse>"),/Invalid request/);
assert.equal(s.baseCurrency, "USD");
const eur = parseFlexStatement(readFileSync("scripts/fixtures/flex-sample.xml","utf8").replace(/currency="USD" reportDate/g, 'currency="EUR" reportDate'));
assert.equal(eur.baseCurrency, "EUR");
console.log("ALL FLEX TESTS PASSED");
