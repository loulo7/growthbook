import { useRouter } from "next/router";
import Link from "next/link";
import { useState } from "react";
import { useDefinitions } from "@/services/DefinitionsContext";
import LoadingOverlay from "@/components/LoadingOverlay";
import { GBEdit } from "@/components/Icons";
import MoreMenu from "@/components/Dropdown/MoreMenu";
import DeleteButton from "@/components/DeleteButton/DeleteButton";
import { useAuth } from "@/services/auth";
import FactTableModal from "@/components/FactTables/FactTableModal";
import Code from "@/components/SyntaxHighlighting/Code";
import FactModal from "@/components/FactTables/FactModal";
import usePermissions from "@/hooks/usePermissions";
import FactList from "@/components/FactTables/FactList";
import FactFilterList from "@/components/FactTables/FactFilterList";
import EditProjectsForm from "@/components/Projects/EditProjectsForm";
import PageHead from "@/components/Layout/PageHead";
import EditTagsForm from "@/components/Tags/EditTagsForm";
import SortedTags from "@/components/Tags/SortedTags";
import FactMetricModal from "@/components/FactTables/FactMetricModal";
import FactMetricList, {
  getMetricsForFactTable,
} from "@/components/FactTables/FactMetricList";
import MarkdownInlineEdit from "@/components/Markdown/MarkdownInlineEdit";
import Tabs from "@/components/Tabs/Tabs";
import Tab from "@/components/Tabs/Tab";

export default function FactTablePage() {
  const router = useRouter();
  const { ftid } = router.query;

  const [editOpen, setEditOpen] = useState(false);

  const [editFactOpen, setEditFactOpen] = useState("");
  const [newFactOpen, setNewFactOpen] = useState(false);
  const [editProjectsOpen, setEditProjectsOpen] = useState(false);
  const [editTagsModal, setEditTagsModal] = useState(false);

  const [metricOpen, setMetricOpen] = useState(false);

  const { apiCall } = useAuth();

  const permissions = usePermissions();

  const {
    factTables,
    ready,
    mutateDefinitions,
    getProjectById,
    projects,
    getDatasourceById,
    factMetrics,
  } = useDefinitions();
  const factTable = factTables.find((f) => f.id === ftid);

  if (!ready) return <LoadingOverlay />;

  if (!factTable) {
    return (
      <div className="alert alert-danger">
        Could not find the requested fact table.{" "}
        <Link href="/fact-tables">Back to all fact tables</Link>
      </div>
    );
  }

  const canEdit = permissions.check(
    "manageFactTables",
    factTable.projects || ""
  );

  const numMetrics = getMetricsForFactTable(factMetrics, factTable.id).length;

  return (
    <div className="pagecontents container-fluid">
      {editOpen && (
        <FactTableModal close={() => setEditOpen(false)} existing={factTable} />
      )}
      {newFactOpen && (
        <FactModal close={() => setNewFactOpen(false)} factTable={factTable} />
      )}
      {editFactOpen && (
        <FactModal
          close={() => setEditFactOpen("")}
          factTable={factTable}
          existing={factTable.facts.find((f) => f.id === editFactOpen)}
        />
      )}
      {editProjectsOpen && (
        <EditProjectsForm
          projects={factTable.projects}
          cancel={() => setEditProjectsOpen(false)}
          save={async (projects) => {
            await apiCall(`/fact-tables/${factTable.id}`, {
              method: "PUT",
              body: JSON.stringify({
                projects,
              }),
            });
          }}
          mutate={mutateDefinitions}
          entityName="Fact Table"
        />
      )}
      {editTagsModal && (
        <EditTagsForm
          tags={factTable.tags}
          save={async (tags) => {
            await apiCall(`/fact-tables/${factTable.id}`, {
              method: "PUT",
              body: JSON.stringify({ tags }),
            });
          }}
          cancel={() => setEditTagsModal(false)}
          mutate={mutateDefinitions}
        />
      )}
      {metricOpen && (
        <FactMetricModal
          close={() => setMetricOpen(false)}
          initialFactTable={factTable.id}
        />
      )}
      <PageHead
        breadcrumb={[
          { display: "Fact Tables", href: "/fact-tables" },
          { display: factTable.name },
        ]}
      />
      <div className="row mb-3">
        <div className="col-auto">
          <h1 className="mb-0">{factTable.name}</h1>
        </div>
        {canEdit && (
          <div className="ml-auto">
            <MoreMenu>
              <button
                className="dropdown-item"
                onClick={(e) => {
                  e.preventDefault();
                  setEditOpen(true);
                }}
              >
                Edit Fact Table
              </button>
              <DeleteButton
                className="dropdown-item"
                displayName="Fact Table"
                useIcon={false}
                text="Delete Fact Table"
                onClick={async () => {
                  await apiCall(`/fact-tables/${factTable.id}`, {
                    method: "DELETE",
                  });
                  mutateDefinitions();
                  router.push("/fact-tables");
                }}
              />
            </MoreMenu>
          </div>
        )}
      </div>
      <div className="row mb-3">
        {projects.length > 0 ? (
          <div className="col-auto">
            Projects:{" "}
            {factTable.projects.length > 0 ? (
              factTable.projects.map((p) => (
                <span className="badge badge-secondary mr-1" key={p}>
                  {getProjectById(p)?.name || p}
                </span>
              ))
            ) : (
              <em className="mr-1">All Projects</em>
            )}
            {canEdit && (
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  setEditProjectsOpen(true);
                }}
              >
                <GBEdit />
              </a>
            )}
          </div>
        ) : null}
        <div className="col-auto">
          Tags: <SortedTags tags={factTable.tags} />
          {canEdit && (
            <a
              className="ml-1 cursor-pointer"
              onClick={() => setEditTagsModal(true)}
            >
              <GBEdit />
            </a>
          )}
        </div>
        <div className="col-auto">
          Data source:{" "}
          <Link href={`/datasources/${factTable.datasource}`}>
            <a className="font-weight-bold">
              {getDatasourceById(factTable.datasource)?.name || "Unknown"}
            </a>
          </Link>
        </div>
        <div className="col-auto">
          Identifier Types:{" "}
          {factTable.userIdTypes.length > 0 ? (
            factTable.userIdTypes.map((t) => (
              <span className="badge badge-secondary mr-1" key={t}>
                {t}
              </span>
            ))
          ) : (
            <em>None</em>
          )}
        </div>
      </div>

      <h3>Description</h3>
      <div className="appbox p-3 bg-white mb-3">
        <MarkdownInlineEdit
          canEdit={canEdit}
          canCreate={canEdit}
          value={factTable.description}
          save={async (description) => {
            await apiCall(`/fact-tables/${factTable.id}`, {
              method: "PUT",
              body: JSON.stringify({
                description,
              }),
            });
            mutateDefinitions();
          }}
        />
      </div>

      <div className="mb-4">
        <h3>Fact Table SQL Definition</h3>
        <Code code={factTable.sql} language="sql" expandable={true} />
      </div>

      <h3>Facts, Filters, and Metrics</h3>
      <Tabs newStyle={true} showActiveCount={true}>
        <Tab display="Facts" padding={false} count={factTable.facts.length}>
          <div className="mb-4">
            <div className="mb-1">
              Facts are numeric columns or SQL expressions that represent a
              specific value you care about. For example, &quot;Page Load
              Time&quot;, &quot;Revenue&quot;, or &quot;API Requests&quot;.
            </div>
            <div className="appbox p-3">
              <FactList factTable={factTable} />
            </div>
          </div>
        </Tab>
        <Tab display="Filters" padding={false} count={factTable.filters.length}>
          <div className="mb-4">
            <div className="mb-1">
              Filters are re-usable SQL snippets that can be applied to Facts
              and Metrics to limit the rows that are included in an analysis.
            </div>
            <div className="appbox p-3">
              <FactFilterList factTable={factTable} />
            </div>
          </div>
        </Tab>
        <Tab display="Metrics" padding={false} count={numMetrics}>
          <div className="mb-4">
            <div className="mb-1">
              Metrics are built on top of Facts and Filters. These are what you
              use as Goals and Guardrails in experiments. This only lists
              metrics tied to this Fact Table.{" "}
              <Link href="/metrics">View all Metrics</Link>
            </div>
            <div className="appbox p-3">
              <FactMetricList factTable={factTable} />
            </div>
          </div>
        </Tab>
      </Tabs>
    </div>
  );
}
