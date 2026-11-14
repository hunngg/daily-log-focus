# 審查後小修

- `savePlan()` 現在會正確回傳儲存結果；儲存失敗不啟動計時。
- 若已存在匯入前復原資料，再次匯入前會警告並要求確認，避免無提示覆蓋。請先下載並確認完整備份。
- 離線快取版本更新至 v5。

## 測試
`node --test tests/core.test.mjs`：4 項通過；`node --check app.js`：通過。
瀏覽器實機／GitHub Pages 部署尚未驗證。
