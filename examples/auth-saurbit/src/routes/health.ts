import { applyModifiers, groupResponses, MediaTypeModifier, ResponseDocsModifier } from "@kaapi/kaapi";

export const healthRoute = applyModifiers<{ AuthCredentialsExtra: { app: { id: string } } }>(
  {
    method: "GET",
    path: "/health",
    handler: (req) => ({ status: "ok", currentClient: req.auth.credentials.app }),
    options: {
      auth: {
        mode: "required",
        access: {
          entity: "app",
          scope: "health:read",
        }
      },
      description: "Health check endpoint for verifying server status and authentication.",
      tags: ["Health"],
    },
  },
  {
    responses: groupResponses(
      new ResponseDocsModifier("HealthCheckResponse")
        .setDescription("Response schema for health check endpoint")
        .addMediaType(
          "application/json",
          new MediaTypeModifier()
            .setSchema({
              type: "object",
              properties: {
                status: { type: "string", enum: ["ok"] },
                currentClient: { type: "object" },
              },
              required: ["status", "currentClient"],
            })
            .setExample({
              status: "ok",
              currentClient: { id: "example-client" },
            })
        )
        .setCode(200)
    ),
  }
);
