export const Status = {
    IDLE: 'idle',
    LOADING: 'loading',
    SUCCESS: 'success',
    ERROR: 'error',
} as const;

export type StatusType = typeof Status[keyof typeof Status];