import {parentPort, workerData} from "worker_threads";
import {GraphMap} from "../modules/ExchangeRateCalculator";
const workerID: number = workerData.workerID
const freeWorkers: Int32Array = workerData.freeWorkers

const adjMatrix: number[][] = workerData.adjacencyMatrix
const targetVertex: number = workerData.targetVertex

const graph: GraphMap = new Map<number, Map<number, number>>()
for (let i = 0; i < adjMatrix.length; i++) {
    graph.set(i, new Map())
    for (let j = 0; j < adjMatrix.length; j++) {
        if (adjMatrix[i][j] != -1 && i != j) {
            graph.get(i)?.set(j, adjMatrix[i][j])
        }
    }
}

parentPort?.on('message', (msg) => {
    const startVertex: number = msg.startVertex
    const currentPath: number[] = msg.currentPath
    const currentRate: number = msg.currentRate

    let maxProduct = 0
    let maxProductPath: number[] = []

    function backtrack(currentVertex: number, seenVertexes: Set<number>,
                       sequencePath: number[], currentProduct: number): number {

        if (currentVertex === targetVertex) {
            if (currentProduct > maxProduct) {
                maxProduct = currentProduct
                maxProductPath = [...sequencePath]
            }
            return 1
        }

        let product = 0
        if (graph.has(currentVertex)) {
            for (const neighbor of graph.get(currentVertex)!.keys()) {
                if (!(seenVertexes.has(neighbor))) {
                    if (Atomics.load(freeWorkers, workerID) > 0) {
                        freeWorkers[workerID]--
                        let toPass = [...sequencePath]
                        toPass.push(neighbor)
                        askForCalculation(toPass, neighbor, currentProduct * graph.get(currentVertex)!.get(neighbor)!)
                        continue
                    }
                    seenVertexes.add(neighbor)
                    sequencePath.push(neighbor)

                    const backtrackResult = backtrack(
                        neighbor,
                        seenVertexes,
                        sequencePath,
                        currentProduct * graph.get(currentVertex)!.get(neighbor)!)

                    product = Math.max(product,
                        graph.get(currentVertex)!.get(neighbor)! * backtrackResult
                    )

                    sequencePath.pop()
                    seenVertexes.delete(neighbor)
                }
            }
        }
        return product
    }

    backtrack(startVertex, new Set(currentPath), currentPath, currentRate)
    sendCalculationCompleted(maxProduct, maxProductPath)
})


function askForCalculation(currentPath: number[], startVertex: number, currentRate: number) {
    parentPort?.postMessage({
        messageType: 1,
        currentPath: currentPath,
        startVertex: startVertex,
        currentRate: currentRate
    })
}

function sendCalculationCompleted(rate: number, path: number[]) {
    parentPort?.postMessage({
        messageType: 0,
        workerID: workerID,
        rate: rate,
        path: path
    })
}