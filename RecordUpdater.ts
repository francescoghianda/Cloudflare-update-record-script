import { lookup, log, logHistory, NetworkError } from "./utils"
import cloudflare from './cloudflare'
import { UpdateDnsRecordResponse } from "./cloudflare"

interface UpdateResult {
    status: "success" | "skipped" | "error";
    error?: "network" | "api" | "lookup";
    ip?: string;
    apiResponse?: UpdateDnsRecordResponse;
}

const API_TOKEN = process.env.API_TOKEN
const ZONE_ID = process.env.ZONE_ID
const RECORD_ID = process.env.RECORD_ID

const RECORD_NAME = process.env.RECORD_NAME

if (!API_TOKEN || !ZONE_ID || !RECORD_ID || !RECORD_NAME) {
    throw Error("Please set the required environment variables")
}

cloudflare.config(API_TOKEN)


let status: "ready" |  "running" | "stopped" = "ready"
let lastResult: UpdateResult
let lastUpdateSkipped: boolean
let lastSuccessfulUpdateDate: Date
let timeOnNextUpdate: number

let apiErrors: number = 0
let networkErrors: number = 0
let timer: Timer
let onstop: (unexpectedStop) => void

const update = async (forceUpdate: boolean = false): Promise<UpdateResult>  => {

    log("Updating record...")

    try {
        const newIp = await lookup()

        log(`New IP: ${newIp}.`)

        if (lastResult && lastResult.ip === newIp) log("The IP is not changed from the last update.")

        if (!forceUpdate && lastResult && lastResult.status !== "error" && newIp === lastResult.ip) {
            log("Update skipped.")
            return {
                status: "skipped",
                ip: newIp
            }
        }

        const requestBody = {
            content: newIp,
            name: RECORD_NAME,
            type: "A"
        }

        const response = await cloudflare.updateDnsRecord(ZONE_ID, RECORD_ID, requestBody)

        if (response.success) {
            log("Record updated successfully.")
            return {
                status: "success",
                ip: newIp,
                apiResponse: response
            }
        }

        log("Record update failed. Check the last respose for more details about the error.", "error")

        return {
            status: "error",
            error: "api",
            ip: newIp,
            apiResponse: response
        }

    }
    catch (error) {

        log("Connection error", "error")

        return {
            status: "error",
            error: error instanceof NetworkError ? "network" : "lookup"
        }

    }
}

const schedule = (millis: number, forceUpdate: boolean = false) => {
    if (timer) return
    log(`Next record update in ${millis/60_000} min`)
    timeOnNextUpdate = Date.now() + millis
    timer = setTimeout(async () => {

        const nextUpdateTime = await updateAndGetNextScheduleTime(forceUpdate)

        timer = null
        schedule(nextUpdateTime)

    }, millis)
}

const updateAndGetNextScheduleTime = async (forceUpdate: boolean) => {

    let nextUpdateTime = 10 * 60 * 1000

    const result = await update(forceUpdate)
    lastResult = result

    lastUpdateSkipped = result.status === "skipped"
    if (result.status === "success") lastSuccessfulUpdateDate = new Date()

    if (result.status === "success" || result.status === "skipped") {
        apiErrors = 0
        networkErrors = 0
    }
    else {
        if (result.error === "api") {
            apiErrors++
            nextUpdateTime = 2 * 60 * 1000
            if (apiErrors > 2) {
                // Stop service
                log("Repeated API errors.")
                log("Service stopped.")
                timeOnNextUpdate = -1
                if (onstop) onstop(true)
                return
            }
        }
        else {
            networkErrors++
            nextUpdateTime = networkErrors > 1 ? 30 * 60 * 1000 : 0
            if (networkErrors > 1) log("Possible network problem.")
        }

        if (nextUpdateTime === 0) log("Retry")
        else log(`Retry in ${nextUpdateTime/60_000} min`)
    }

    return nextUpdateTime
}

const deleteTimer = () => {
    clearTimeout(timer)
    timeOnNextUpdate = -1
    timer = null
}

const start = () => {
    log("Service started.")
    status = "running"
    schedule(0)
}

const stop = () => {
    deleteTimer()
    status = "stopped"
    log("Service stopped.")
    if(onstop) onstop(false)
}

const updateSync = () => {
    log("Manual update (sync).")
    deleteTimer()
    schedule(0, true)
}

const updateAsync = () => {
    log("Manual update (async).")
    updateAndGetNextScheduleTime(true)
}

const serviceData = () => {
    return {
        status,
        lastResult,
        logHistory,
        lastSuccessfulUpdateDate,
        lastUpdateSkipped,
        nextUpdateIn: timeOnNextUpdate > 0 ? `${Math.round((timeOnNextUpdate - Date.now())/60_000)} min` : '-'
    }
}

const onStop = (callback: (unexpectedStop: boolean) => void) => {
    onstop = callback
}

export default {
    start,
    stop,
    onStop,
    updateSync,
    updateAsync,
    serviceData
}

