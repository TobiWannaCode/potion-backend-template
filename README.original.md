# potion-backend-template

## Install dependencies
```bash
npm install
```

## Run the functions locally
```bash
cd app/deployments/main
sls invoke local -s local -f walletsSyncJob
sls invoke local -s local -f walletsTradesAPI -p ./wallets/api/.tests/trades.json
```
example `/wallets/api/.tests/trades.json`
```json
{
  "queryStringParameters": {
    "wallet": "suqh5sHtr8HyJ7q8scBimULPkPpA557prMG47xCHQfK",
    "sortBy": "created_at",
    "sortDirection": "DESC"
  }
}
```

# Deploy all functions
```bash
sls deploy -s prod
```

# Deploy each function
```bash
sls deploy -s prod -f walletsSyncJob
sls deploy -s prod -f walletsTradesAPI
```

