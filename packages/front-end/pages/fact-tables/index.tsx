import { isProjectListValidForProject } from "shared/util";
import Link from "next/link";
import { useCallback, useState } from "react";
import { date } from "shared/dates";
import { FaAngleDown, FaAngleRight } from "react-icons/fa";
import { useRouter } from "next/router";
import { useDefinitions } from "@/services/DefinitionsContext";
import FactTableModal from "@/components/FactTables/FactTableModal";
import { GBAddCircle } from "@/components/Icons";
import usePermissions from "@/hooks/usePermissions";
import Tooltip from "@/components/Tooltip/Tooltip";
import { useAddComputedFields, useSearch } from "@/services/search";
import Field from "@/components/Forms/Field";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import PageHead from "@/components/Layout/PageHead";
import TagsFilter, {
  filterByTags,
  useTagsFilter,
} from "@/components/Tags/TagsFilter";
import SortedTags from "@/components/Tags/SortedTags";
import ProjectBadges from "@/components/ProjectBadges";

export default function FactTablesPage() {
  const { factTables, getDatasourceById, project } = useDefinitions();

  const router = useRouter();

  const permissions = usePermissions();

  const [aboutOpen, setAboutOpen] = useLocalStorage("aboutFactTables", true);

  const [createFactOpen, setCreateFactOpen] = useState(false);

  const filteredFactTables = project
    ? factTables.filter((t) =>
        isProjectListValidForProject(t.projects, project)
      )
    : factTables;

  const canCreate = permissions.check("manageFactTables", project);

  const factTablesWithLabels = useAddComputedFields(
    filteredFactTables,
    (table) => {
      const sortedUserIdTypes = [...table.userIdTypes];
      sortedUserIdTypes.sort();
      return {
        ...table,
        datasourceName: getDatasourceById(table.datasource)?.name || "Unknown",
        numFacts: table.facts.length,
        numFilters: table.filters.length,
        userIdTypes: sortedUserIdTypes,
      };
    },
    [getDatasourceById]
  );

  const tagsFilter = useTagsFilter("facttables");
  const filterResults = useCallback(
    (items: typeof factTablesWithLabels) => {
      items = filterByTags(items, tagsFilter.tags);
      return items;
    },
    [tagsFilter.tags]
  );

  const { items, searchInputProps, isFiltered, SortableTH, clear } = useSearch({
    items: factTablesWithLabels,
    defaultSortField: "name",
    localStorageKey: "factTables",
    searchFields: [
      "name^3",
      "tags",
      "datasourceName",
      "userIdTypes",
      "description",
    ],
    filterResults,
  });

  return (
    <div className="pagecontents container-fluid">
      {createFactOpen && (
        <FactTableModal close={() => setCreateFactOpen(false)} />
      )}
      <PageHead breadcrumb={[{ display: "Fact Tables" }]} />
      <h1>
        Fact Tables
        <span className="badge badge-purple border text-uppercase ml-2">
          Beta
        </span>
      </h1>
      <div className="mb-3">
        <a
          className="font-weight-bold"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setAboutOpen(!aboutOpen);
          }}
        >
          About Fact Tables {aboutOpen ? <FaAngleDown /> : <FaAngleRight />}
        </a>
        {aboutOpen && (
          <div className="alert alert-info">
            <div className="mb-2">
              A <strong>Fact Table</strong> contains a base SQL definition, plus
              one or more <strong>Facts</strong> built on top of this base
              query. You can use these Facts to quickly build a library of{" "}
              <strong>Metrics</strong>.
            </div>
            <div className="mb-3">
              With Fact Tables, you can better organize your metrics, cut down
              on repetitive copy/pasting, and unlock massive SQL cost savings{" "}
              <Tooltip
                body={
                  <>
                    <p>
                      <strong>Coming Soon!</strong> GrowthBook will be able to
                      calculate multiple metrics in a single database query when
                      they share the same Fact Table.
                    </p>
                    <p>
                      For warehouses like BigQuery that charge based on data
                      scanned, this can drastically reduce the costs, especially
                      when an experiment has many metrics.
                    </p>
                  </>
                }
              />
              .
            </div>

            <h4>Example</h4>
            <table className="table w-auto mb-0">
              <tbody>
                <tr>
                  <th>Fact Table</th>
                  <td>Orders</td>
                  <td></td>
                  <td></td>
                  <td></td>
                </tr>
                <tr>
                  <th>Facts</th>
                  <td>Revenue</td>
                  <td>Number of Items</td>
                  <td></td>
                  <td></td>
                </tr>
                <tr>
                  <th>Metrics</th>
                  <td>Purchasers</td>
                  <td>Revenue per User</td>
                  <td>Average Order Value</td>
                  <td>Items per Order</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="row mb-2 align-items-center">
        {filteredFactTables.length > 0 && (
          <>
            <div className="col-lg-3 col-md-4 col-6">
              <Field
                placeholder="Search..."
                type="search"
                {...searchInputProps}
              />
            </div>
            <div className="col-auto">
              <TagsFilter filter={tagsFilter} items={items} />
            </div>
            <div className="ml-auto"></div>
          </>
        )}
        <div className="col-auto">
          <Tooltip
            body={
              canCreate
                ? ""
                : `You don't have permission to create fact tables ${
                    project ? "in this project" : ""
                  }`
            }
          >
            <button
              className="btn btn-primary"
              onClick={(e) => {
                e.preventDefault();
                if (!canCreate) return;
                setCreateFactOpen(true);
              }}
              disabled={!canCreate}
            >
              <GBAddCircle /> Add Fact Table
            </button>
          </Tooltip>
        </div>
      </div>

      {filteredFactTables.length > 0 && (
        <>
          <table className="table appbox gbtable table-hover">
            <thead>
              <tr>
                <SortableTH field="name">Name</SortableTH>
                <SortableTH field="datasourceName">Data Source</SortableTH>
                <SortableTH field="tags">Tags</SortableTH>
                <th>Projects</th>
                <SortableTH field="userIdTypes">Identifier Types</SortableTH>
                <SortableTH field="numFacts">Facts</SortableTH>
                <SortableTH field="numFilters">Filters</SortableTH>
                <SortableTH field="dateUpdated">Last Updated</SortableTH>
              </tr>
            </thead>
            <tbody>
              {items.map((f) => (
                <tr
                  key={f.id}
                  onClick={(e) => {
                    e.preventDefault();
                    router.push(`/fact-tables/${f.id}`);
                  }}
                  className="cursor-pointer"
                >
                  <td>
                    <Link href={`/fact-tables/${f.id}`}>{f.name}</Link>
                  </td>
                  <td>{f.datasourceName}</td>
                  <td>
                    <SortedTags tags={f.tags} />
                  </td>
                  <td className="col-2">
                    {f.projects.length > 0 ? (
                      <ProjectBadges
                        projectIds={f.projects}
                        className="badge-ellipsis short align-middle"
                      />
                    ) : (
                      <ProjectBadges className="badge-ellipsis short align-middle" />
                    )}
                  </td>
                  <td>
                    {f.userIdTypes.map((t) => (
                      <span className="badge badge-secondary mr-1" key={t}>
                        {t}
                      </span>
                    ))}
                  </td>
                  <td>{f.numFacts}</td>
                  <td>{f.numFilters}</td>
                  <td>{date(f.dateUpdated)}</td>
                </tr>
              ))}

              {!items.length && isFiltered && (
                <tr>
                  <td colSpan={6} align={"center"}>
                    No matching fact tables.{" "}
                    <a
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        clear();
                      }}
                    >
                      Clear search field
                    </a>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}