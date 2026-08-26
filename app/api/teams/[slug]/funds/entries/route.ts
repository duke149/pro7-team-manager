import { createFinanceEntry, mutateFinanceEntry } from "../../../../../../lib/funds/actions";

export async function mutateFundsRoute(request: Request, params: Promise<{ slug: string }>, handler: (request: Request, target: { slug: string }) => Promise<Response>) { return handler(request, await params); }
export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) { return mutateFundsRoute(request, context.params, createFinanceEntry); }
export async function PATCH(request: Request, context: { params: Promise<{ slug: string }> }) { return mutateFundsRoute(request, context.params, mutateFinanceEntry); }
