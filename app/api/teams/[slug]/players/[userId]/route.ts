import { deactivateTeamPlayer, updateTeamPlayer } from "../../../../../../lib/squad/actions";

type Target = { slug: string; userId: string };
type MutationHandlers = {
  updateTeamPlayer: (request: Request, target: Target) => Promise<Response>;
  deactivateTeamPlayer: (request: Request, target: Target) => Promise<Response>;
};

export async function mutatePlayerRoute(
  method: "PATCH" | "DELETE",
  request: Request,
  params: Promise<Target>,
  handlers: MutationHandlers,
): Promise<Response> {
  const target = await params;
  return method === "PATCH"
    ? handlers.updateTeamPlayer(request, target)
    : handlers.deactivateTeamPlayer(request, target);
}

export async function PATCH(
  request: Request,
  context: { params: Promise<Target> },
): Promise<Response> {
  return mutatePlayerRoute("PATCH", request, context.params, {
    updateTeamPlayer,
    deactivateTeamPlayer,
  });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<Target> },
): Promise<Response> {
  return mutatePlayerRoute("DELETE", request, context.params, {
    updateTeamPlayer,
    deactivateTeamPlayer,
  });
}
