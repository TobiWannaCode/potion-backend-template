import axios from 'axios';

class HeliusHelper {
    constructor() {
        const apiKey = process.env.HELIUS_API_KEY;
        this.rpcUrl = `https://rpc.helius.xyz/?api-key=${apiKey}`;
        console.log('HeliusHelper initialized with RPC URL:', this.rpcUrl);
        
        // Simple rate limiting
        this.lastCallTime = Date.now();
        this.minTimeBetweenCalls = 333; // ~3 calls per second
    }

    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async waitForRateLimit() {
        const now = Date.now();
        const timeSinceLastCall = now - this.lastCallTime;

        if (timeSinceLastCall < this.minTimeBetweenCalls) {
            const waitTime = this.minTimeBetweenCalls - timeSinceLastCall;
            await this.sleep(waitTime);
        }

        this.lastCallTime = Date.now();
    }

    async makeRpcCall(method, params, id) {
        await this.waitForRateLimit();

        console.log(`\n[RPC Call] ${method}`, {
            params,
            timestamp: new Date().toISOString()
        });

        const response = await fetch(this.rpcUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id,
                method,
                params
            })
        });

        const data = await response.json();
        
        if (data.error) {
            console.error(`[RPC Error] ${method}:`, data.error);
            throw new Error(data.error.message);
        }

        console.log(`[RPC Success] ${method}:`, {
            resultSummary: data.result ? 
                (Array.isArray(data.result) ? 
                    `Array of ${data.result.length} items` : 
                    typeof data.result === 'object' ? 
                        Object.keys(data.result) : 
                        data.result
                ) : 'No result'
        });

        return data;
    }

    async getWalletBalance(address) {
        try {
            console.log('\n[getWalletBalance] Starting balance check for address:', address);
            
            const data = await this.makeRpcCall('getBalance', [address], 'balance');
            
            const balanceInLamports = data.result.value;
            const balanceInSOL = balanceInLamports / 1e9;
            
            const result = {
                address,
                balanceInSOL,
                balanceInLamports,
                slot: data.result.context.slot,
                timestamp: new Date().toISOString()
            };

            console.log('[getWalletBalance] Result:', result);
            return result;
        } catch (error) {
            console.error('[getWalletBalance] Error:', error);
            throw new Error(`Failed to get balance for address ${address}: ${error.message}`);
        }
    }

    async getTokenMetadata(mints) {
        try {
            console.log('[getTokenMetadata] Fetching metadata for mints:', mints);

            const metadata = {};
            for (const mint of mints) {
                try {
                    const response = await this.makeRpcCall(
                        'getAsset',
                        [mint],
                        'token_metadata'
                    );

                    if (response.result) {
                        metadata[mint] = {
                            name: response.result.content?.metadata?.name || 
                                  response.result.content?.metadata?.symbol ||
                                  response.result.symbol ||
                                  'Unknown',
                            symbol: response.result.content?.metadata?.symbol || 
                                   response.result.symbol
                        };
                    }
                } catch (error) {
                    console.error(`[getTokenMetadata] Error fetching metadata for ${mint}:`, error);
                }
            }

            return metadata;
        } catch (error) {
            console.error('[getTokenMetadata] Error:', error);
            return {};
        }
    }

    async getTokenTransactions(address, startTime) {
        try {
            console.log('\n[getTokenTransactions] Starting transaction fetch', {
                address,
                startTime: new Date(startTime).toISOString(),
                endTime: new Date().toISOString()
            });

            const endTime = new Date();

            // Get signatures for the address
            const signaturesData = await this.makeRpcCall(
                'getSignaturesForAddress',
                [
                    address,
                    {
                        commitment: 'confirmed'
                    }
                ],
                'signatures'
            );

            if (!signaturesData.result || signaturesData.result.length === 0) {
                console.log('[getTokenTransactions] No signatures found');
                return {};
            }

            const signatures = signaturesData.result;
            console.log(`[getTokenTransactions] Found ${signatures.length} total signatures`);

            // Filter signatures by time
            const filteredSignatures = signatures.filter(sig => {
                const txTime = new Date(sig.blockTime * 1000);
                return txTime > new Date(startTime) && txTime <= endTime;
            });

            console.log(`[getTokenTransactions] Filtered to ${filteredSignatures.length} signatures within time range`);

            // Group transactions by mint
            const transactionsByMint = {};
            const uniqueMints = new Set();
            
            for (const sig of filteredSignatures) {
                try {
                    const txData = await this.makeRpcCall(
                        'getTransaction',
                        [
                            sig.signature,
                            {
                                encoding: 'jsonParsed',
                                maxSupportedTransactionVersion: 0,
                                commitment: 'confirmed'
                            }
                        ],
                        'transaction'
                    );

                    if (!txData.result) continue;

                    const tx = txData.result;
                    
                    if (!tx.meta) continue;

                    // Check if this transaction involves token transfers
                    if (tx.meta.preTokenBalances && tx.meta.postTokenBalances) {
                        const preBalances = tx.meta.preTokenBalances;
                        const postBalances = tx.meta.postTokenBalances;

                        // Find balances related to our address
                        const addressPreBalances = preBalances.filter(balance => 
                            balance.owner === address
                        );
                        
                        const addressPostBalances = postBalances.filter(balance => 
                            balance.owner === address
                        );

                        // Track SOL balance changes for the specified wallet only
                        let solMovement = null;
                        
                        // Find the account index by looking at the account keys
                        const accountKeys = tx.transaction.message.accountKeys;
                        let accountIndex = -1;
                        
                        for (let i = 0; i < accountKeys.length; i++) {
                            if (typeof accountKeys[i] === 'string' && accountKeys[i] === address) {
                                accountIndex = i;
                                break;
                            } else if (accountKeys[i].pubkey && accountKeys[i].pubkey === address) {
                                accountIndex = i;
                                break;
                            }
                        }
                        
                        if (accountIndex !== -1 && tx.meta.preBalances && tx.meta.postBalances) {
                            const preSol = tx.meta.preBalances[accountIndex] / 1e9;
                            const postSol = tx.meta.postBalances[accountIndex] / 1e9;
                            const solDiff = postSol - preSol;

                            if (Math.abs(solDiff) > 0.000001) {
                                solMovement = {
                                    preSol,
                                    postSol,
                                    solChange: solDiff
                                };
                            }
                        }

                        // Add transaction if we have token balances or SOL changes
                        if (addressPreBalances.length > 0 || addressPostBalances.length > 0 || solMovement) {
                            const transaction = {
                                signature: sig.signature,
                                blockTime: new Date(tx.blockTime * 1000).toISOString(),
                                slot: tx.slot,
                                preTokenBalances: addressPreBalances,
                                postTokenBalances: addressPostBalances,
                                solMovement,
                                type: 'token',
                                success: tx.meta.err === null,
                                fee: tx.meta.fee / 1e9
                            };

                            // Add to each token's transactions
                            const processedMints = new Set();
                            [...addressPreBalances, ...addressPostBalances].forEach(balance => {
                                if (processedMints.has(balance.mint)) return;
                                processedMints.add(balance.mint);
                                uniqueMints.add(balance.mint);
                                
                                if (!transactionsByMint[balance.mint]) {
                                    transactionsByMint[balance.mint] = {
                                        metadata: {
                                            id: `${address}|${balance.mint}`,
                                            wallet: address,
                                            token_name: 'Unknown', // Will be updated with metadata
                                            token_address: balance.mint,
                                            first_trade: transaction.blockTime,
                                            last_trade: transaction.blockTime,
                                            buys: 0,
                                            sells: 0,
                                            invested_sol: 0,
                                            total_sol_received: 0,
                                            realized_pnl: 0,
                                            roi: 0
                                        },
                                        transactions: []
                                    };
                                }

                                const mintData = transactionsByMint[balance.mint];
                                mintData.transactions.push(transaction);

                                // Update metadata
                                const meta = mintData.metadata;
                                
                                // Update first_trade if this transaction is older
                                if (transaction.blockTime < meta.first_trade) {
                                    meta.first_trade = transaction.blockTime;
                                }
                                
                                // Update last_trade if this transaction is newer
                                if (transaction.blockTime > meta.last_trade) {
                                    meta.last_trade = transaction.blockTime;
                                }

                                // Update metadata
                                if (transaction.success && solMovement) {
                                    const preBalance = transaction.preTokenBalances.find(b => b.mint === balance.mint);
                                    const postBalance = transaction.postTokenBalances.find(b => b.mint === balance.mint);

                                    const preAmount = preBalance ? Number(preBalance.uiTokenAmount.uiAmount || 0) : 0;
                                    const postAmount = postBalance ? Number(postBalance.uiTokenAmount.uiAmount || 0) : 0;
                                    const tokenDiff = postAmount - preAmount;
                                    const solChange = solMovement.solChange;

                                    if (Math.abs(tokenDiff) > 0.000001) {
                                        if (tokenDiff > 0 && solChange < 0) {
                                            // Buying tokens (token balance increases, SOL decreases)
                                            meta.buys++;
                                            meta.invested_sol += Math.abs(solChange);
                                        } else if (tokenDiff < 0 && solChange > 0) {
                                            // Selling tokens (token balance decreases, SOL increases)
                                            meta.sells++;
                                            meta.total_sol_received += solChange;
                                        }

                                        // Calculate realized PnL
                                        meta.realized_pnl = meta.total_sol_received - meta.invested_sol;

                                        // Update ROI
                                        meta.roi = meta.invested_sol > 0 ? (meta.realized_pnl / meta.invested_sol) * 100 : 0;
                                        
                                        // Round numbers
                                        meta.invested_sol = parseFloat(meta.invested_sol.toFixed(4));
                                        meta.total_sol_received = parseFloat(meta.total_sol_received.toFixed(4));
                                        meta.realized_pnl = parseFloat(meta.realized_pnl.toFixed(4));
                                        meta.roi = parseFloat(meta.roi.toFixed(2));
                                    }
                                }
                            });
                        }
                    }
                } catch (error) {
                    console.error(`[getTokenTransactions] Error processing transaction ${sig.signature}:`, error);
                    continue;
                }
            }

            // Fetch and update token metadata
            const tokenMetadata = await this.getTokenMetadata([...uniqueMints]);
            for (const [mint, data] of Object.entries(transactionsByMint)) {
                if (tokenMetadata[mint]) {
                    data.metadata.token_name = tokenMetadata[mint].name;
                }
            }

            console.log(`[getTokenTransactions] Found transactions for ${Object.keys(transactionsByMint).length} mints`);
            return transactionsByMint;

        } catch (error) {
            console.error('[getTokenTransactions] Error:', error);
            throw new Error(`Failed to get token transactions for address ${address}: ${error.message}`);
        }
    }

    async getSolPrice() {
        try {
            const response = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
            if (response.data && response.data.solana && response.data.solana.usd) {
                return response.data.solana.usd;
            }
            throw new Error('Unable to get SOL price from CoinGecko');
        } catch (error) {
            console.error('Error fetching SOL price:', error);
            throw error;
        }
    }
}

export default new HeliusHelper();
