import { parentPort } from 'worker_threads'
import { GraphConstructor} from "../modules/GraphConstructor";

(async () => {
    const graphConstructor = new GraphConstructor()
    const timer = (ms: number) => new Promise(res => setTimeout(res, ms))
    while(1) {
        console.log('getting graph')
        const exchangeRates = await graphConstructor.getGraph()

        if (exchangeRates != undefined) {
            console.log('got graph')
            parentPort?.postMessage({
                originalRates: exchangeRates.originalRates,
                loggedRates: exchangeRates.loggedRates,
                tokensIndexes: exchangeRates.tokensIndexes,
                tokensIDs: exchangeRates.tokensIDs
            })
        } else {
            console.log('no graph')
            continue
        }
        await timer(1200000)
    }
})()
