import { lookup, log, logHistory, NetworkError } from "./utils"
import cloudflare from './cloudflare'
import { UpdateDnsRecordResponse } from "./cloudflare"
import { DelayedTask, DelayedTaskResult } from "./DeleyedTask"

interface UpdateResult {
    status: "success" | "skipped" | "error";
    error?: "network" | "api" | "lookup";
    ip?: string;
    apiResponse?: UpdateDnsRecordResponse;
}

/*interface ScheduleResult {
    status: "executed" | "canceled"
    result?: UpdateResult
}

interface Schedule {
    timer: Timer
    resolveFunction: (ScheduleResult) => void
    time: number
}*/

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

let apiErrors: number = 0
let networkErrors: number = 0

//let pendingSchedule: Schedule

let syncUpdateTask: DelayedTask<UpdateResult>

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

const syncUpdate = (millis: number, forceUpdate: boolean = false): Promise<DelayedTaskResult<UpdateResult>> => {
    if (syncUpdateTask && syncUpdateTask.getStatus() === 'pending'){
        return Promise.resolve({
            status: "canceled",
        })
    }

    syncUpdateTask = DelayedTask(millis, () => {
        return update(forceUpdate)
    })

    return syncUpdateTask.getResult().then(taskResult => {

        if (taskResult.status === "executed") {
            const updateResult = taskResult.result

            const nextUpdateTime = getNextUpdateTime(updateResult)

            // Update the exported data
            setServiceData(updateResult)

            if (nextUpdateTime < 0) {
                // Stop service
                log("Repeated API errors.")
                log("Service stopped.")
                if (onstop) onstop(true)
                return
            }

            if (updateResult.status === 'error') {
                if (nextUpdateTime === 0) log("Retry")
                else log(`Retry in ${nextUpdateTime/60_000} min`)
            }

            if (networkErrors > 1) log("Possible network problem.")


            syncUpdate(nextUpdateTime)

        }

        return taskResult
    })
}

const setServiceData = (updateResult: UpdateResult) => {
    lastResult = updateResult
    lastUpdateSkipped = updateResult.status === "skipped"
    if (updateResult.status === "success") lastSuccessfulUpdateDate = new Date()
}

const getNextUpdateTime = (result: UpdateResult): number => {

    if (result.status === "success" || result.status === "skipped") {
        apiErrors = 0
        networkErrors = 0

        return 10 * 60 * 1000 // 10 min
    }

    // In case of error:

    if (result.error === "api") {
        apiErrors++
        if (apiErrors > 2) return -1 // In case of repeated API error, stop the service
        return 2 * 60 * 1000
    }
    else {
        networkErrors++
        return networkErrors > 1 ? 30 * 60 * 1000 : 0 // At first network error retry immediatly. In case of repeated network error, retry after 30 min
    }

}

/*const schedule = (millis: number, forceUpdate: boolean = false): Promise<ScheduleResult> => {
    if (pendingSchedule) return
    log(`Next record update in ${millis/60_000} min`)
    
    return new Promise((resolve) => {
        
        const timer = setTimeout(async () => {

            pendingSchedule = null

            const res = await updateAndGetNextScheduleTime(forceUpdate)

            resolve({
                status: "executed",
                result: res.result
            })

            if (res.nextUpdateTime < 0) {
                log("Repeated API errors.")
                log("Service stopped.")
                if (onstop) onstop(true)
                return
            }

            if (res.result.status === "error") {
                if (res.nextUpdateTime === 0) log("Retry")
                else log(`Retry in ${res.nextUpdateTime/60_000} min`)
            }
    
            schedule(res.nextUpdateTime)
    
        }, millis)

        pendingSchedule = {
            timer: timer,
            resolveFunction: resolve,
            time: Date.now() + millis
        }
    })
}*/

/*const updateAndGetNextScheduleTime = async (forceUpdate: boolean) => {

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
                return {
                    result,
                    nextUpdateTime: -1
                }
            }
        }
        else {
            networkErrors++
            nextUpdateTime = networkErrors > 1 ? 30 * 60 * 1000 : 0
            if (networkErrors > 1) log("Possible network problem.")
        }

    }

    return {
        result,
        nextUpdateTime
    }
}*/

const cancelNextUpdate = () => {
    /*if (pendingSchedule) {
        clearTimeout(pendingSchedule.timer)
        pendingSchedule.resolveFunction({status: "canceled"})
        pendingSchedule = null
    }*/
    if (syncUpdateTask) {
        syncUpdateTask.cancel()
        syncUpdateTask = null
    }  
}

const start = () => {
    if (status === 'running') return
    log("Service started.")
    status = "running"
    //schedule(0)
    syncUpdate(0)
}

const stop = () => {
    if (status !== 'running') return
    cancelNextUpdate()
    status = "stopped"
    log("Service stopped.")
    if(onstop) onstop(false)
}

const updateSync = (forceUpdate: boolean): Promise<DelayedTaskResult<UpdateResult>> => {
    if (status !== 'running') return
    log("Manual update (sync).")
    cancelNextUpdate()
    return syncUpdate(0, forceUpdate)
}

const updateAsync = (forceUpdate: boolean): Promise<UpdateResult> => {
    log("Manual update (async).")
    /*return new Promise(async resolve => {
        const res = await updateAndGetNextScheduleTime(forceUpdate)
        resolve(res.result)
    })*/
    return new Promise(async resolve => {
        const updateResult = await update(forceUpdate)
        setServiceData(updateResult)
        resolve(updateResult)
    })
}

const serviceData = () => {
    return {
        status,
        lastResult,
        logHistory,
        lastSuccessfulUpdateDate,
        lastUpdateSkipped,
        nextUpdateIn: syncUpdateTask ? `${Math.round(syncUpdateTask.getTimeLeft()/60_000)} min` : '-'
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

