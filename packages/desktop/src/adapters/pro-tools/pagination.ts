import type {
	PaginationRequest,
	PaginationResponse,
} from "../../third-party/protools-sdk/dist/PTSL";

// Fetches every page of a paginated command and returns all items
export async function iterateAll<
	Res extends { paginationResponse?: PaginationResponse | undefined },
	Item,
>(
	fetchPage: (request: { paginationRequest: PaginationRequest }) => Promise<Res>,
	itemsOf: (response: Res) => Item[],
	limit = 100,
): Promise<Item[]> {
	const items: Item[] = [];
	for (let offset = 0; ; offset += limit) {
		const response = await fetchPage({ paginationRequest: { limit, offset } });
		const page = itemsOf(response);
		items.push(...page);
		// Stop on an empty page too, in case a command doesn't report a total
		const total = response.paginationResponse?.total ?? 0;
		if (page.length === 0 || offset + limit >= total) return items;
	}
}
