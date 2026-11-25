export enum ServiceStatus {
  OK = 'ok',
  DEGRADED = 'degraded',
  DOWN = 'down',
}

export enum RepeatMode {
  OFF = 'off',
  ALL = 'all',
  ONE = 'one',
}

export enum AudioQuality {
  STANDARD = 'standard',
  HIGH = 'high',
  LOSSLESS = 'lossless',
}

export enum StreamingProtocol {
  HLS = 'hls',
  PROGRESSIVE = 'progressive',
}

export enum UserRole {
  USER = 'user',
  ADMIN = 'admin',
}
