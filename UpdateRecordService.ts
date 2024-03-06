import { lookup, log, logHistory, NetworkError } from "./utils"
import cloudflare from './cloudflare'
import { UpdateDnsRecordResponse } from "./cloudflare"

const API_TOKEN = process.env.API_TOKEN
const ZONE_ID = process.env.ZONE_ID
const RECORD_ID = process.env.RECORD_ID

const RECORD_NAME = process.env.RECORD_NAME

if (!API_TOKEN || !ZONE_ID || !RECORD_ID || !RECORD_NAME) {
    throw Error("Please set the required environment variables")
}

cloudflare.config(API_TOKEN)

let running = false

let networkErrors = 0
let apiErrors = 0

let lastIp: string = ""
let lastResponse: UpdateDnsRecordResponse | undefined
let lastSuccessfulUpdate: Date | undefined
let lastUpdateSkipped: boolean = false

let forceUpdate: boolean = false

let timer: Timer
let pendingPromiseResolve: () => void

const sleep = (millis) => {
    return new Promise((resolve: (value: void) => void) => {
        pendingPromiseResolve = resolve
        timer = setTimeout(resolve, millis)
    }).then(() => {pendingPromiseResolve = undefined})
}


const startService = async () => {

    if (running) return
    
    log("Update record service started")
    running = true

    let unexpectedStop = false

    while (running) {

        try {
            log("Updating record...")

            const currentIp = await lookup()

            if (!forceUpdate && currentIp === lastIp && apiErrors === 0) {
                // Skip update
                lastUpdateSkipped = true
                log("Update skipped (IP not changed from last update)")
                log("Next update in 10 min")
                await sleep(10 * 60 * 1000)
                continue
            }

            forceUpdate = false
            lastUpdateSkipped = false
            lastIp = currentIp
            
            const requestBody = {
                content: currentIp,
                name: RECORD_NAME,
                type: "A"
            }

            const response = await cloudflare.updateDnsRecord(ZONE_ID, RECORD_ID, requestBody)

            lastResponse = response
            networkErrors = 0

            if (response.success) {
                
                apiErrors = 0
                lastSuccessfulUpdate = new Date()
                log("Record updated successfully.")
                log("Next update in 10 min")
                await sleep(10 * 60 * 1000)
                continue

            }
            else {

                apiErrors++
                log("Record update failed. Check the last respose for more details about the error.", "error")

                if (apiErrors > 2) {
                    log("Too many errors.")
                    unexpectedStop = true
                    break
                }

                log("Retry in 2 min")
                await sleep(2 * 60 * 1000)
                continue

            }



        }
        catch (error) {

            networkErrors++
            log("Connection error")

            if (networkErrors > 1) {

                log("Possible network problems")
                log("Retry in 30 min")
                await sleep(30 * 60 * 1000)
                continue

            }
            else {

                log("Retry")
                continue

            }

        }


    } // While end

    running = false
    log("Service stopped.")

    return unexpectedStop

}

const stopService = () => {
    running = false
    updateNow(false) // Called to terminate the loop
}

const updateNow = async (force: boolean) => {
    forceUpdate = force
    log(`Manual update requested (force=${force})`)
    clearTimeout(timer)
    if (pendingPromiseResolve) {
        pendingPromiseResolve()
    }
}

const serviceData = () => {
    return {
        running,
        lastIp,
        lastResponse,
        lastSuccessfulUpdate,
        lastUpdateSkipped,
        logHistory
    }
}

export default {
    startService,
    stopService,
    updateNow,
    serviceData
}


