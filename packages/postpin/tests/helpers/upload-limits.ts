/** Backs UPLOAD_MAX_FILE_SIZE of the mocked `$app/env/private`; reset before each test */
export const uploadLimits: { maxFileSize: bigint | undefined } = { maxFileSize: undefined };

export function setUploadMaxFileSize(bytes: number | bigint | undefined) {
	uploadLimits.maxFileSize = bytes === undefined ? undefined : BigInt(bytes);
}
