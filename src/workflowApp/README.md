# IAM Workflow Manager — Prototype

A minimal web app that stands in for the **workflow authoring** part of a legacy
IBM IAM tool. It exists to prototype the one thing that is painful today: moving a
**workflow** (the artifact the IAM app produces) from a **test/dev** environment to
a **prod** environment, without re-creating it by hand.

Because the real IAM application is legacy — no API, no backend access, everything
goes through its web UI — this prototype models the workflow as a plain **XML file**
and treats the filesystem as the "environment". Promoting a workflow between
environments becomes **export → transfer the file → import**.

All workflows here belong to a single organization: **Ahold Group**. Within the org,
each workflow targets a **Business Unit** (HR, IT Security, Compliance, …).

## Intended setup

Deploy **two instances** of this same app — one per environment:

| Instance | `WF_ENV` | What you do there |
|---|---|---|
| dev  | `DEV`  | Create a workflow, save it, **export** it (downloads to your machine) |
| prod | `PROD` | **Import** the downloaded file, review it, save it to `workflows/` |

The instances share no storage. The downloaded XML file *is* the transfer
mechanism, which is exactly the manual step a pipeline would later automate.
The header badge shows `WF_ENV` so the two instances are never confused.

## What it does

- **Create & save** a workflow (metadata + ordered activities) → `workflows/`
- **Show** a workflow read-only, including its generated XML (the artifact)
- **Export** a workflow → saved to `exports/` **and** downloaded to the browser
- **Import** a workflow from the local machine → copied to `imports/` and loaded
  into the form, then **Save** (promote to `workflows/`) or **Cancel** (discard)
- **List & edit** existing workflows (empty state when there are none)

## Folders

| Folder | Holds |
|---|---|
| `workflows/` | The live set of saved workflows (manual or promoted from an import) |
| `imports/`   | Verbatim copies of workflows uploaded from a client machine |
| `exports/`   | Workflows exported for transfer to another environment |

They are created automatically on first run.

## Workflows are identified by filename

A workflow's identity is its **filename**, because the filename is what actually
travels between environments. The name is derived once, from the workflow name:

```
"Access Request Approval"  →  access_request_approval.xml
```

From then on it is preserved:

- **Editing** a workflow writes back to the same file (no duplicate copies).
- **Exporting** keeps the filename, so the server copy in `exports/` and the
  browser download have identical names.
- **Importing** keeps the uploaded filename, so after promotion dev and prod
  hold the same artifact name.

`<Id>`, `<Version>` and `<CreatedDate>` are carried across unchanged — promoting a
workflow to prod does not relabel it as created today.

## The promotion walkthrough

On the **dev** instance:

1. **+ New Workflow** → fill in metadata, add activities → **Save**
   → written to `workflows/access_request_approval.xml`
2. **Export XML** → written to `exports/access_request_approval.xml` *and*
   downloaded to your machine under the same name.

On the **prod** instance:

3. **↑ Import Workflow** → pick the downloaded file.
   A verbatim copy lands in `imports/`, and the workflow loads into the form.
   It is **not** in `workflows/` yet — a banner says so.
4. Review or adjust it, then:
   - **Save** → promoted to `workflows/access_request_approval.xml`
   - **Cancel** → discarded; nothing is written to `workflows/`
     (the `imports/` copy stays as a record of the upload)

```
 DEV                                                  PROD
 ┌───────────────┐   Export (→ exports/, download)   ┌───────────────┐
 │  workflows/   │ ────────────────────────────────▶ │   imports/    │
 │   my-wf.xml   │           transfer file           │   my-wf.xml   │
 └───────────────┘                                   └──────┬────────┘
                                                      Save  │  Cancel
                                                            ▼     └──▶ discarded
                                                     ┌───────────────┐
                                                     │  workflows/   │
                                                     │   my-wf.xml   │
                                                     └───────────────┘
```

## Run it

```bash
python server.py
```

Then open http://localhost:5173. Pass a port as `python server.py 8080`.

Set the environment label shown in the header:

```bash
WF_ENV=DEV python server.py 5173
```

To try the full promotion path on one machine, run **two copies in separate
folders** (each instance owns its own `workflows/`, `imports/` and `exports/`):

```bash
cp -r src/workflowApp /tmp/iam-dev && cp -r src/workflowApp /tmp/iam-prod
rm -f /tmp/iam-prod/workflows/*.xml /tmp/iam-prod/imports/*.xml /tmp/iam-prod/exports/*.xml
WF_ENV=DEV  python /tmp/iam-dev/server.py  5173 &
WF_ENV=PROD python /tmp/iam-prod/server.py 5174 &
```

Export from `:5173`, then import into `:5174`.

## API

| Method | Path | Purpose |
|---|---|---|
| `GET`  | `/api/info` | `{"env": "DEV"}` — the header badge label |
| `GET`  | `/api/workflows` | List `workflows/` with parsed metadata + filename |
| `GET`  | `/api/workflows/<filename>` | Raw XML of one workflow (`.xml` optional) |
| `POST` | `/api/workflows` | Save to `workflows/` |
| `POST` | `/api/imports` | Store an upload verbatim in `imports/` |
| `POST` | `/api/exports` | Save to `exports/` |

The three `POST` bodies take `{filename, name, id, xml}`. `filename` pins the
destination (used for edits and promotions); when it is absent the server derives
the name from `name`, falling back to `id`. All path segments and filenames are
sanitised, so `..` cannot escape the three folders.

> Prototype only — no auth, no concurrency control, local filesystem storage.
