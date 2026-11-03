"""Write the OpenAPI schema for the frontend's generated types.

`npm run api-types` (in frontend/) calls this, then openapi-typescript turns the schema into
`src/lib/api-types.ts`. Run it after changing any pydantic schema.
"""

import json
import sys

from .main import app

if __name__ == "__main__":
    json.dump(app.openapi(), sys.stdout, indent=1)
