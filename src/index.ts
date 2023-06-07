import express from "express"

import {ExchangeRates, CrossRateResult, CrossRateCalculator} from "./modules/ExchangeRateCalculator";
import {BiMap} from "@jsdsl/bimap";
const crossRatesCalculator = new CrossRateCalculator()

const app = express()
app.use(express.json())
app.listen(3000)
const requestSequence: [req: any, res: any][] = []
let isBusy = false

import {EventEmitter} from "events";
const eventEmitter = new EventEmitter()

app.post('/cross-rate', (req, res) => {
    requestSequence.push([req, res])
    if (!isBusy) {
        eventEmitter.emit('request')
    }
})

eventEmitter.on('request', () => {
    if (requestSequence.length == 0 || isBusy) {
        return
    }
    console.log('processing request')
    isBusy = true

    let reqAndRes = requestSequence.shift()!
    let req = reqAndRes[0]
    let res = reqAndRes[1]

    const sourceCurrency = req.body.sourceCurrency
    const targetCurrency = req.body.targetCurrency
    const amount: number | undefined = req.body.amount

    crossRatesCalculator.getCrossRate(sourceCurrency, targetCurrency, (result) => {
        if (result == undefined) {
            res.status(404).json({ error: 'Failed to calculate cross rate' })
        } else {
            let multipliedRate = result!.rate * (amount == undefined ? 1 : amount!)
            res.send(new CrossRateResult(result!.path, multipliedRate))
        }
        isBusy = false
        eventEmitter.emit('request')
    })
})

import {Worker} from 'worker_threads'
const worker = new Worker('./dist/workers/GraphConstructorWorker.js')

worker.on('message', msg => {
    const originalRates: number[][] = msg.originalRates
    const loggedRates: number[][] = msg.loggedRates
    const tokensIndexes: number[] = msg.tokensIndexes
    const tokensIDs: string[] = msg.tokensIDs

    const biMap = new BiMap<number, string>()
    tokensIndexes.forEach(value => {
        biMap.set(value, tokensIDs[value])
    })

    const exchangeRates = new ExchangeRates(originalRates, loggedRates, biMap)

    crossRatesCalculator.setExchangeRates(exchangeRates)
})


