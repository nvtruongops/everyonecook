'use client';

import React, { useState, useMemo } from 'react';

// Base table interfaces
export interface TableColumn<T = any> {
  key: string;
  title: string;
  dataIndex?: keyof T;
  render?: (value: any, record: T, index: number) => React.ReactNode;
  width?: string | number;
  align?: 'left' | 'center' | 'right';
  sortable?: boolean;
  filterable?: boolean;
  fixed?: 'left' | 'right';
  className?: string;
}

export interface TableProps<T = any> {
  columns: TableColumn<T>[];
  data: T[];
  loading?: boolean;
  pagination?: {
    current: number;
    pageSize: number;
    total: number;
    onChange: (page: number, pageSize: number) => void;
    showSizeChanger?: boolean;
    showQuickJumper?: boolean;
  };
  rowKey?: string | ((record: T) => string);
  onRow?: (record: T, index: number) => {
    onClick?: () => void;
    onDoubleClick?: () => void;
    className?: string;
  };
  scroll?: {
    x?: number | string;
    y?: number | string;
  };
  size?: 'small' | 'middle' | 'large';
  bordered?: boolean;
  striped?: boolean;
  hoverable?: boolean;
  responsive?: boolean;
  emptyText?: React.ReactNode;
  className?: string;
  rowSelection?: {
    type: 'checkbox' | 'radio';
    selectedRowKeys: (string | number)[];
    onChange: (selectedRowKeys: (string | number)[], selectedRows: T[]) => void;
    getCheckboxProps?: (record: T) => { disabled?: boolean };
  };
  expandable?: {
    expandedRowRender: (record: T, index: number) => React.ReactNode;
    expandedRowKeys?: (string | number)[];
    onExpand?: (expanded: boolean, record: T) => void;
  };
}

// Sort types
type SortOrder = 'asc' | 'desc' | null;

interface SortState {
  key: string;
  order: SortOrder;
}

// Professional Table Component
function Table<T = any>({
  columns,
  data,
  loading = false,
  pagination,
  rowKey = 'id',
  onRow,
  scroll,
  size = 'middle',
  bordered = false,
  striped = true,
  hoverable = true,
  responsive = true,
  emptyText,
  className = '',
  rowSelection,
  expandable,
}: TableProps<T>) {
  const [sortState, setSortState] = useState<SortState>({ key: '', order: null });
  const [expandedKeys, setExpandedKeys] = useState<Set<string | number>>(new Set());

  // Get row key
  const getRowKey = (record: T, index: number): string => {
    if (typeof rowKey === 'function') {
      return rowKey(record);
    }
    return (record as any)[rowKey] || index.toString();
  };

  // Handle sorting
  const handleSort = (column: TableColumn<T>) => {
    if (!column.sortable) return;

    const newOrder: SortOrder = 
      sortState.key === column.key 
        ? sortState.order === 'asc' 
          ? 'desc' 
          : sortState.order === 'desc' 
            ? null 
            : 'asc'
        : 'asc';

    setSortState({ key: column.key, order: newOrder });
  };

  // Sort data
  const sortedData = useMemo(() => {
    if (!sortState.order || !sortState.key) return data;

    const column = columns.find(col => col.key === sortState.key);
    if (!column) return data;

    return [...data].sort((a, b) => {
      const aValue = column.dataIndex ? (a as any)[column.dataIndex] : a;
      const bValue = column.dataIndex ? (b as any)[column.dataIndex] : b;

      if (aValue === bValue) return 0;
      
      const result = aValue < bValue ? -1 : 1;
      return sortState.order === 'asc' ? result : -result;
    });
  }, [data, sortState.order, sortState.key, columns]); 
 // Handle row expansion
  const handleExpand = (key: string | number) => {
    const newExpandedKeys = new Set(expandedKeys);
    if (expandedKeys.has(key)) {
      newExpandedKeys.delete(key);
    } else {
      newExpandedKeys.add(key);
    }
    setExpandedKeys(newExpandedKeys);
  };

  // Handle row selection
  const handleRowSelect = (record: T, selected: boolean) => {
    if (rowSelection?.onChange) {
      const key = getRowKey(record, 0);
      const selectedKeys = rowSelection.selectedRowKeys || [];
      const newSelectedKeys = selected
        ? [...selectedKeys, key]
        : selectedKeys.filter(k => k !== key);
      rowSelection.onChange(newSelectedKeys, selected ? [record] : []);
    }
  };

  if (!data || data.length === 0) {
    return (
      <div className={`table-container ${className}`}>
        <div className="empty-state">
          {emptyText || 'No data available'}
        </div>
      </div>
    );
  }

  return (
    <div className={`table-container ${responsive ? 'table-responsive' : ''} ${className}`}>
      <table className={`table ${striped ? 'table-striped' : ''} ${hoverable ? 'table-hover' : ''}`}>
        <thead>
          <tr>
            {rowSelection && (
              <th>
                <input
                  type="checkbox"
                  onChange={(e) => {
                    // Handle select all
                    const allKeys = sortedData.map((record, index) => getRowKey(record, index));
                    rowSelection.onChange?.(e.target.checked ? allKeys : [], e.target.checked ? sortedData : []);
                  }}
                />
              </th>
            )}
            {expandable && <th></th>}
            {columns.map((column) => (
              <th
                key={column.key}
                className={column.sortable ? 'sortable' : ''}
                onClick={() => handleSort(column)}
              >
                {column.title}
                {column.sortable && (
                  <span className="sort-indicator">
                    {sortState.key === column.key ? (
                      sortState.order === 'asc' ? '↑' : sortState.order === 'desc' ? '↓' : '↕'
                    ) : '↕'}
                  </span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedData.map((record, index) => {
            const key = getRowKey(record, index);
            const isExpanded = expandedKeys.has(key);
            const isSelected = rowSelection?.selectedRowKeys?.includes(key);

            return (
              <React.Fragment key={key}>
                <tr>
                  {rowSelection && (
                    <td>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => handleRowSelect(record, e.target.checked)}
                      />
                    </td>
                  )}
                  {expandable && (
                    <td>
                      <button onClick={() => handleExpand(key)}>
                        {isExpanded ? '−' : '+'}
                      </button>
                    </td>
                  )}
                  {columns.map((column) => (
                    <td key={column.key}>
                      {column.render
                        ? column.render(column.dataIndex ? (record as any)[column.dataIndex] : record, record, index)
                        : column.dataIndex
                        ? (record as any)[column.dataIndex]
                        : ''}
                    </td>
                  ))}
                </tr>
                {expandable && isExpanded && (
                  <tr>
                    <td colSpan={columns.length + (rowSelection ? 1 : 0) + 1}>
                      {expandable.expandedRowRender(record, index, 1, isExpanded)}
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default Table;
