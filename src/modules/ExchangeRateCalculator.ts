import {BiMap} from "@jsdsl/bimap";
import * as os from "os";
import {Worker, workerData} from 'worker_threads'

export type GraphMatrix = Array<Array<number>>
export type GraphMap = Map<number, Map<number, number>>
export type VertexIndexToVertexName = BiMap<number, string>

export class ExchangeRates {
    readonly originalRates: GraphMatrix
    readonly loggedRates: GraphMatrix
    readonly vertexIndexToVertexName: VertexIndexToVertexName

    constructor(originalRates: GraphMatrix, loggedRates: GraphMatrix, vertexIndexToVertexName: VertexIndexToVertexName) {
        this.originalRates = originalRates
        this.loggedRates = loggedRates
        this.vertexIndexToVertexName = vertexIndexToVertexName
    }
}

export class CrossRateResult {
    readonly path: Array<string>
    readonly rate: number

    constructor(path: Array<string>, rate: number) {
        this.path = path
        this.rate = rate
    }
}

class _CrossRateResult {
    readonly path: Array<number>
    readonly rate: number

    constructor(path: Array<number>, rate: number) {
        this.path = path
        this.rate = rate
    }
}

enum ShortestPathAlgorithmType {
    FLOYD_WARSHALL,
    DFS
}

export class CrossRateCalculator {
    private exchangeRates: ExchangeRates = new ExchangeRates([], [], new BiMap())

    private resultMatrix: GraphMatrix | undefined
    private pathMatrix: GraphMatrix | undefined

    private calculationResultAlgorithm: ShortestPathAlgorithmType | undefined = ShortestPathAlgorithmType.DFS

    setExchangeRates(graph: ExchangeRates) {
        this.exchangeRates = graph
        this.performFloydWarshallAlgorithm()
    }

    getCrossRate(sourceCurrency: string,
                 targetCurrency: string,
                 callback: (crossRateResult: CrossRateResult | undefined) => void) {
        if (!this.exchangeRates.vertexIndexToVertexName.hasValue(sourceCurrency) ||
            !this.exchangeRates.vertexIndexToVertexName.hasValue(targetCurrency) || this.exchangeRates.originalRates.length < 2) {
            callback(undefined)
            return
        }

        const sourceCurrencyIndex = this.exchangeRates.vertexIndexToVertexName.getFromValue(sourceCurrency)!
        const targetCurrencyIndex = this.exchangeRates.vertexIndexToVertexName.getFromValue(targetCurrency)!

        if (this.calculationResultAlgorithm == ShortestPathAlgorithmType.FLOYD_WARSHALL) {
            const crossRateResult = this.constructPath(sourceCurrencyIndex, targetCurrencyIndex)
            if (crossRateResult == undefined) {
                callback(undefined)
            } else {
                let maxProductPathWithVertexNames: string[] = []
                crossRateResult!.path.forEach(value => {
                    const vertexName = this.exchangeRates.vertexIndexToVertexName.getFromKey(value)!
                    maxProductPathWithVertexNames.push(vertexName)
                })
                callback(new CrossRateResult(maxProductPathWithVertexNames, crossRateResult.rate))
            }
        } else {
            this.performDFS(sourceCurrencyIndex, targetCurrencyIndex, callback)
        }
    }

    private constructPath(sourceVertexIndex: number, targetVertexIndex: number): _CrossRateResult | undefined {
        const pathMatrix = this.pathMatrix!
        const resultMatrix = this.resultMatrix!

        if (pathMatrix[sourceVertexIndex][targetVertexIndex] == -1) {
            return undefined
        }

        let currentVertex = sourceVertexIndex
        const path = [currentVertex]
        while (currentVertex != targetVertexIndex) {
            currentVertex = this.pathMatrix![currentVertex][targetVertexIndex]
            path.push(currentVertex)
        }

        return new _CrossRateResult(path, resultMatrix[sourceVertexIndex][targetVertexIndex])
    }

    private performFloydWarshallAlgorithm() {
        console.log('perform floyd warshall')
        const graphSize = this.exchangeRates.loggedRates.length

        const resultGraph = new Array<number[]>()
        const pathMatrix = new Array<number[]>()

        for (let i = 0; i < graphSize; i++) {
            resultGraph.push([])
            pathMatrix.push([])
            for (let j = 0; j < graphSize; j++) {
                resultGraph[i].push(this.exchangeRates.loggedRates[i][j])

                if (resultGraph[i][j] == Infinity) {
                    pathMatrix[i].push(-1)
                } else {
                    pathMatrix[i].push(j)
                }
            }
        }

        for (let currentVertex = 0; currentVertex < graphSize; currentVertex++) {
            for (let row = 0; row < graphSize; row++) {
                for (let column = 0; column < graphSize; column++) {
                    if (resultGraph[row][currentVertex] + resultGraph[currentVertex][column] < resultGraph[row][column]) {
                        resultGraph[row][column] = resultGraph[row][currentVertex] + resultGraph[currentVertex][column]
                        pathMatrix[row][column] = pathMatrix[row][currentVertex]
                    }
                }
            }
        }

        let hasNegativeCycle = false
        for (let i = 0; i < graphSize; i++) {
            if (resultGraph[i][i] != 0) {
                hasNegativeCycle = true
                break
            }
        }

        if (hasNegativeCycle) {
            console.log('negative cycle')
            this.resultMatrix = undefined
            this.pathMatrix = undefined
            this.calculationResultAlgorithm = ShortestPathAlgorithmType.DFS
        } else {
            console.log('no negative cycles')
            this.resultMatrix = resultGraph
            this.pathMatrix = pathMatrix
            this.calculationResultAlgorithm = ShortestPathAlgorithmType.FLOYD_WARSHALL
        }
    }

    performDFS(sourceCurrencyIndex: number, targetCurrencyIndex: number, callback: (crossRateResult: CrossRateResult | undefined) => void) {
        const vertexIndexToIndexName = this.exchangeRates.vertexIndexToVertexName

        const adjacencyMatrix = this.exchangeRates.originalRates

        const workersCount = os.cpus().length - 2 > adjacencyMatrix.length ? adjacencyMatrix.length : os.cpus().length - 2

        let sharedBuff = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * workersCount);

        let amountOfTasksToDelegateForEachWorker = new Int32Array(sharedBuff)

        const workers = new Map<number, Worker>()
        const freeWorkers: Worker[] = []
        const tasksQueue: any[] = []

        let maxRate = 0
        let pathForMaxRate: number[] = []

        for (let i = 0; i < workersCount; i++) {
            const worker = new Worker('./dist/workers/DFSWorker.js', {
                workerData: {
                    workerID: i,
                    freeWorkers: amountOfTasksToDelegateForEachWorker,
                    adjacencyMatrix: adjacencyMatrix,
                    targetVertex: targetCurrencyIndex
                }
            })

            workers.set(i, worker)
            freeWorkers.push(worker)

            worker.on('message', msg => {
                let messageType: number = msg.messageType

                if (messageType == 0) {
                    const workerID: number = msg.workerID
                    const rate: number = msg.rate
                    const path: number[] = msg.path

                    if (rate > maxRate) {
                        maxRate = rate
                        pathForMaxRate = path
                    }

                    freeWorkers.push(workers.get(workerID)!)

                    if (freeWorkers.length == workersCount && tasksQueue.length == 0) {
                        const finish = Date.now()
                        console.log('maxRate: ' + maxRate)
                        // console.log('path for maxRate: ' + pathForMaxRate)
                        console.log(`Execution time: ${finish - start} ms`);
                        const pathInString = pathForMaxRate.map(value => {
                            return vertexIndexToIndexName.getFromKey(value)!
                        })

                        if (pathInString.length == 0 && maxRate == 0) {
                            callback(undefined)
                        } else {
                            let exchangeResult = new CrossRateResult(pathInString, maxRate)
                            callback(exchangeResult)
                        }

                        workers.forEach(worker => {
                            worker.terminate()
                        })
                    } else if (tasksQueue.length > 0) {
                        createTaskForWorker()
                    } else {
                        for (let [key, value] of workers) {
                            if (!freeWorkers.includes(value)) {
                                Atomics.add(amountOfTasksToDelegateForEachWorker, key, 1)
                            }
                        }
                    }
                } else if (messageType == 1) {
                    let task = {
                        currentPath: msg.currentPath,
                        startVertex: msg.startVertex,
                        currentRate: msg.currentRate
                    }
                    tasksQueue.push(task)

                    if (freeWorkers.length > 0) {
                        createTaskForWorker()
                    }
                }
            })
        }

        tasksQueue.push(
            {
                currentPath: [sourceCurrencyIndex],
                startVertex: sourceCurrencyIndex,
                currentRate: 1
            }
        )
        amountOfTasksToDelegateForEachWorker[0] = workersCount - 1
        const start = Date.now()
        createTaskForWorker()

        function createTaskForWorker() {
            if (tasksQueue.length > 0 && freeWorkers.length > 0) {
                const task = tasksQueue.shift()!
                const freeWorker = freeWorkers.shift()!
                freeWorker.postMessage(task)
            }
        }
    }
}