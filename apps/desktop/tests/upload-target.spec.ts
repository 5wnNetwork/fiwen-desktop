import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDesktopUploadPlan, type DesktopUploadPlan } from '../scripts/desktop-upload-plan.ts'
import { loadDesktopPackageEnvironment } from '../scripts/desktop-package-environment.mjs'
import { tagDesktopRelease } from '../scripts/desktop-release-tag.ts'
import { uploadDesktopRelease } from '../scripts/desktop-upload-run.ts'
import { runDesktopUploadCommand, uploadDesktopTarget } from '../scripts/upload-target.ts'

vi.mock('../scripts/desktop-package-environment.mjs', () => ({ loadDesktopPackageEnvironment: vi.fn() }))
vi.mock('../scripts/desktop-upload-plan.ts', () => ({ createDesktopUploadPlan: vi.fn() }))
vi.mock('../scripts/desktop-s3.ts', () => ({ createDesktopS3: vi.fn() }))
vi.mock('../scripts/desktop-upload-run.ts', () => ({ uploadDesktopRelease: vi.fn() }))
vi.mock('../scripts/desktop-release-tag.ts', async importOriginal => ({
  ...await importOriginal<typeof import('../scripts/desktop-release-tag.ts')>(),
  tagDesktopRelease: vi.fn(),
}))

afterEach(() => {
  vi.restoreAllMocks()
  vi.resetAllMocks()
})

describe('desktop upload command', () => {
  it.each([
    { environment: 'production', latest: true, tagged: false },
    { environment: 'production', latest: false, tagged: true },
    { environment: 'test', latest: true, tagged: false },
    { environment: 'test', latest: false, tagged: false },
  ] as const)('uploads $environment latest=$latest with tagged=$tagged', async ({ environment, latest, tagged }) => {
    vi.spyOn(process.stdout, 'write').mockReturnValue(true)
    const credentials = { DSH_DESKTOP_AUTO_UPDATE_ENV: environment, DOWNLOAD_TEST_S3_ACCESS_KEY_ID: 'fixture-id', DOWNLOAD_TEST_S3_SECRET_ACCESS_KEY: 'fixture-key' }
    const plan: DesktopUploadPlan = {
      environment, target: 'win-x64', version: '1.2.3-alpha.4',
      publicUrl: 'https://desktop-updates.example.com/desktop/dsh-latest-windows-x64.exe',
      bucket: 'fixture-bucket', endpoint: 'https://s3.example.com', region: 'us-east-1', accessKeyIdEnvName: 'DOWNLOAD_TEST_S3_ACCESS_KEY_ID',
      secretAccessKeyEnvName: 'DOWNLOAD_TEST_S3_SECRET_ACCESS_KEY', artifacts: [], commit: '0'.repeat(40), dirty: false,
    }
    vi.mocked(loadDesktopPackageEnvironment).mockReturnValue(credentials)
    vi.mocked(createDesktopUploadPlan).mockResolvedValue(plan)
    vi.mocked(uploadDesktopRelease).mockResolvedValue('fixture-records')
    vi.mocked(tagDesktopRelease).mockReturnValue({ status: 'created', tag: 'desktop-v1.2.3-alpha.4' })

    await uploadDesktopTarget(['win-x64', ...latest ? ['--latest'] : []])

    expect(createDesktopUploadPlan).toHaveBeenCalledWith('win-x64', { environment: credentials, latest })
    expect(uploadDesktopRelease).toHaveBeenCalledOnce()
    expect(vi.mocked(uploadDesktopRelease).mock.calls[0]![0]).toBe(plan)
    if (tagged) {
      expect(tagDesktopRelease).toHaveBeenCalledWith(expect.objectContaining({ version: plan.version, commit: plan.commit }))
      expect(vi.mocked(tagDesktopRelease).mock.invocationCallOrder[0])
        .toBeGreaterThan(vi.mocked(uploadDesktopRelease).mock.invocationCallOrder[0]!)
    }
    else {
      expect(tagDesktopRelease).not.toHaveBeenCalled()
    }
  })

  it.each([[], ['win-x64', '--purge-only'], ['win-x64', 'mac-x64']])('rejects invalid arguments %j before uploading', async (...args) => {
    vi.mocked(loadDesktopPackageEnvironment).mockReturnValue({ DSH_DESKTOP_AUTO_UPDATE_ENV: 'test' })
    await expect(uploadDesktopTarget(args)).rejects.toThrow()
    expect(uploadDesktopRelease).not.toHaveBeenCalled()
  })

  it('shows usage without referring to a nonexistent record for invalid arguments', async () => {
    const previousExitCode = process.exitCode
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
    try {
      await runDesktopUploadCommand([])
      expect(stderr).toHaveBeenCalledWith(expect.stringContaining('Usage:'))
      expect(stderr).not.toHaveBeenCalledWith(expect.stringContaining('record directory'))
    } finally {
      process.exitCode = previousExitCode
    }
  })
})
