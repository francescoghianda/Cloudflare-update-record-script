type DelayedTaskStatus = "executed" | "canceled" | "error" | "pending"

export interface DelayedTaskResult<T> {
    status: DelayedTaskStatus
    result?: T
    error?: Error
}

export interface DelayedTask<T> {
    cancel: () => void
    getResult: () => Promise<DelayedTaskResult<T>>
    getStatus: () => DelayedTaskStatus
    getTimeLeft: () => number
}

export function planTask<T> (date: Date, task: () => Promise<T> | T): DelayedTask<T> {
    const delay = date.getTime() - Date.now()
    return DelayedTask(delay, task)
}

export function DelayedTask<T> (delay: number, task: () => Promise<T> | T, throwOnError: boolean = true): DelayedTask<T> {

    const startTime = Date.now()
    let status: DelayedTaskStatus = "pending"
    let timer: Timer
    let promiseResolve: (result: DelayedTaskResult<T>) => void

    const resultPromise: Promise<DelayedTaskResult<T>> = new Promise((resolve, reject) => {
        promiseResolve = resolve 
        timer = setTimeout(async () => {
            status = "executed"
            Promise.resolve(task()).then(result => {
                resolve({
                    status: "executed",
                    result: result
                })
            }, 
            error => {
                if (throwOnError) reject(error)
                else {
                    resolve ({
                        status: "error",
                        error: error
                    })
                }
            })
        }, delay)
    })

    const getResult = () => {
        return resultPromise
    }

    const cancel = () => {
        if (status !== "pending") return
        clearTimeout(timer)
        status = "canceled"
        promiseResolve({
            status: "canceled"
        })
    }

    const getStatus = () => {
        return status
    }

    const getTimeLeft = () => {
        return Math.max(delay - (Date.now() - startTime), 0)
    }

    return {
        cancel: cancel,
        getResult: getResult,
        getStatus: getStatus,
        getTimeLeft: getTimeLeft
    }

}