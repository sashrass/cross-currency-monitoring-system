import {convertValueToDecimal, SDK} from '@pontem/liquidswap-sdk';
import tokensJSON from "../data/coins.json"
import {GraphMatrix} from "./ExchangeRateCalculator";

type Token =  {source: string, name: string, chainId: number, decimals: number, symbol: string, type: string, caution: boolean, order: number} |
    {source: string, chainId: number, name: string, decimals: number, symbol: string, type: string, order: number, caution?: undefined}

export class GraphConstructorResult {
    readonly originalRates: GraphMatrix
    readonly loggedRates: GraphMatrix
    readonly tokensIndexes: number[]
    readonly tokensIDs: string[]


    constructor(originalRates: GraphMatrix, loggedRates: GraphMatrix, tokensIndexes: number[], tokensIDs: string[]) {
        this.originalRates = originalRates;
        this.loggedRates = loggedRates;
        this.tokensIndexes = tokensIndexes;
        this.tokensIDs = tokensIDs;
    }
}

export class GraphConstructor {

    private sdk = new SDK({
        nodeUrl: 'https://fullnode.mainnet.aptoslabs.com/v1'})

    private readonly tokens: Array<Token>

    constructor() {
        this.tokens = []
        const seenTokens = new Set<string>()

        tokensJSON.forEach(token => {
            if (!seenTokens.has(token.type)) {
                seenTokens.add(token.type)
                this.tokens.push(token)
            }
        })
    }

    async getGraph(): Promise<GraphConstructorResult | undefined> {
        let loggedRates: GraphMatrix = new Array<Array<number>>()
        let originalRates: GraphMatrix = new Array<Array<number>>()
        const tokensIndexes: number[] = []
        const tokensIDs: string[] = []

        let promises: Promise<void>[] = []

        for (let i = 0; i < this.tokens.length; i++) {
            loggedRates.push(new Array(this.tokens.length))
            originalRates.push(new Array(this.tokens.length))
            tokensIndexes.push(i)
            tokensIDs.push(this.tokens[i].type)
        }

        for (let i = 0; i < this.tokens.length; i++) {
            const fromToken = this.tokens[i]

            for (let j = 0; j < this.tokens.length; j++) {
                if (i == j) {
                    loggedRates[i][i] = 0
                    originalRates[i][i] = 1
                    continue
                }

                const toToken = this.tokens[j]

                promises.push(new Promise<void>(async (resolve, reject) => {
                    try {
                        const isPoolExists = await this.checkPoolExistence(fromToken.type, toToken.type)

                        if (isPoolExists) {
                            const rate = await this.getRate(fromToken, toToken)

                            if (rate > 0) {
                                loggedRates[i][j] = -Math.log2(rate)
                                originalRates[i][j] = rate
                            } else {
                                loggedRates[i][j] = Infinity
                                originalRates[i][j] = -1
                            }
                        }
                        else {
                            loggedRates[i][j] = Infinity
                            originalRates[i][j] = -1
                        }

                        resolve()
                    } catch (e) {
                        console.log('reject: ' + e)
                        reject()
                    }
                }))
            }
        }

        let isError = false
        await Promise.all(promises)
            .catch(() => {
                isError = true
            })

        if (!isError) {
            console.log('no error')
        } else {
            console.log('error occured')
        }

        return isError ? undefined : new GraphConstructorResult(originalRates, loggedRates, tokensIndexes, tokensIDs)
    }

    private async checkPoolExistence(fromTokenType: string, toTokenType: string): Promise<boolean> {
        return await this.sdk.Liquidity.checkPoolExistence({
            fromToken: fromTokenType,
            toToken: toTokenType,
            curveType: 'uncorrelated',
        })
    }

    private async getRate(fromToken: Token, toToken: Token): Promise<number> {
        const rate = await this.sdk.Swap.calculateRates({
            fromToken: fromToken.type, // full 'from' token address
            toToken: toToken.type, // full 'to' token address layerzero USDT
            amount: convertValueToDecimal(1, fromToken.decimals), // 1 APTOS, or you can use convertValueToDecimal(1, 8)
            curveType: 'uncorrelated', // can be 'uncorrelated' or 'stable'
            interactiveToken: 'from', // which token is 'base' to calculate other token rate.
        })

        return (+rate / Math.pow(10, toToken.decimals))
    }
}