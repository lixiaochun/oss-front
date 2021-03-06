import React, { Component } from 'react';
import {
  DownOutlined,
  FolderAddOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { Breadcrumb, Button, Dropdown, Input, Menu, message, Modal, Table } from 'antd';
import copyToClipboard from 'copy-to-clipboard';
import { getIconByFileName, getParamsFromUrl } from '../../util/stringUtils';
import { DeleteObjectHeadApi, GenerateDownloadUrlApi, GenerateUrlWithSignedApi, ListObjectApi } from '../../api/object';
import './index.scss';
import UploadFileDrawer from './components/UploadFileDrawer';
import DetailDrawer from './components/DetailDrawer';
import SetObjectAclDrawer from './components/SetObjectAclDrawer';
import AddFolderDrawer from './components/AddFolderDrawer';
import PolicyListDrawer from './components/PolicyDrawer';
import { getCurrentBucket } from '../../util/Bucket';

const Search = Input.Search;
const confirm = Modal.confirm;

export default class FileManage extends Component {
  static displayName = 'FileManage';

  constructor(props) {
    super(props);
    const bucketInfo = getCurrentBucket();
    const paramsFromUrl = getParamsFromUrl(this.props.location.search);
    this.state = {
      bucketInfo,
      selectedRowKeys: [], // Check here to configure the default column
      selectedRows: [], // Check here to configure the default column
      objectList: [],
      bucketName: this.props.match.params.name,
      // 上传抽屉显示
      visible: false,
      currentPath: paramsFromUrl ? decodeURIComponent(paramsFromUrl.path) : '/',
      // 详情抽屉显示
      detailVisible: false,
      currentRecord: undefined,
      // 文件列表加载状态
      tableLoading: false,

      // 新建目录抽屉显示
      addFolderVisible: false,
      // 设置对象acl 抽屉显示
      setObjectAclVisible: false,
      // 授权auth显示
      showAuthDrawerVisible: false,
      search: '',
    };
  }

  componentDidMount() {
    this.initObjectList();
  }

  initObjectList = async () => {
    const { currentPath, search } = this.state;
    await this.setState({
      selectedRowKeys: [],
      tableLoading: true,
    });
    await ListObjectApi({
      bucket: this.state.bucketName,
      path: currentPath,
      search,
    })
      .then((res) => {
        if (res.msg === 'SUCCESS') {
          this.setState({
            objectList: res.data,
          });
        }
      });
    this.setState({
      tableLoading: false,
    });
  };

  goSearchObject = async (val) => {
    await this.setState({
      search: val,
    });
    this.initObjectList();
  };

  onSelectChange = (selectedRowKeys, selectedRows) => {
    this.setState({
      selectedRowKeys,
      selectedRows,
    });
  };


  onRowClick = (record, e) => {
    e.preventDefault();
    const { selectedRowKeys, selectedRows } = this.state;
    const filterRowKeys = selectedRowKeys.filter(i => i !== record.id);
    const filterRows = selectedRows.filter(i => i.id !== record.id);
    if (filterRowKeys.length === selectedRowKeys.length) {
      filterRowKeys.push(record.id);
    }
    if (filterRows.length === selectedRows.length) {
      filterRows.push(record);
    }
    this.setState({
      selectedRows: filterRows,
      selectedRowKeys: filterRowKeys,
    });
  };

  onRowDoubleClick = async (record, e) => {
    e.preventDefault();
    const { pathname } = this.props.location;
    if (record.isDir) {
      // 进入文件夹
      const path = record.filePath === '/' ? `/${record.fileName}` : `${record.filePath}/${record.fileName}`;
      await this.setState({
        currentPath: path,
        search: '',
      });
      this.props.history.push(`${pathname}?path=${encodeURIComponent(path)}`);
      this.initObjectList();
    }
  };

  onRowContextMenu = (record, e) => {
    e.preventDefault();
  };

  onRowMouseEnter = (record, e) => {
    e.preventDefault();
  };

  onRowMouseLeave = (record, e) => {
    e.preventDefault();
  };

  beginDownload = async (record) => {
    message.info('稍后将自动下载...');
    const url = await this.getObjectUrl(record);
    if (url) {
      if (url.indexOf('&') !== -1) {
        window.location.assign(`${url}&Download=true`);
      } else {
        window.location.assign(`${url}?Download=true`);
      }
    }
  };

  copyUrlToClipboard = async (record) => {
    const url = await this.getObjectUrl(record);
    copyToClipboard(url);
    message.success('复制成功');
  };

  getObjectUrl = async (record) => {
    const { bucketInfo } = this.state;
    const path = record.filePath === '/' ? `/${record.fileName}` : `${record.filePath}/${record.fileName}`;
    const params = {
      bucket: bucketInfo.name,
      objectPath: path,
      timeout: 60,
    };
    let url = '';
    await GenerateUrlWithSignedApi(params)
      .then((res) => {
        if (res.msg === 'SUCCESS') {
          const genTempUrlInfo = res.data;
          if (!record.acl || record.acl.startsWith('PRIVATE') || (record.acl.startsWith('EXTEND') && bucketInfo.acl.startsWith('PRIVATE'))) {
            url = `${genTempUrlInfo.url}?${genTempUrlInfo.signature}`;
          } else {
            url = `${genTempUrlInfo.url}`;
          }
        }
      });
    return url;
  };

  handleMoreMenuClick = async (record, item) => {
    // 设置读写权限
    if (item.key === '1') {
      await this.showSetObjectAclDrawer(record);
      return;
    }
    // 下载
    if (item.key === '2') {
      await this.beginDownload(record);
      return;
    }
    // 复制到剪切板
    if (item.key === '3') {
      await this.copyUrlToClipboard(record);
      return;
    }
    // 删除
    if (item.key === '4') {
      this.showDeleteConfirm(record);
    }
  };

  deleteObject = async (objectId) => {
    await this.setState({
      tableLoading: true,
    });
    const params = {
      bucket: this.state.bucketName,
      objectIds: this.state.selectedRowKeys.join(','),
    };
    if (objectId) {
      params.objectIds = objectId;
    }
    if (!params.objectIds) {
      message.warn('请选择要删除的文件或目录');
      return;
    }
    await DeleteObjectHeadApi(params)
      .then((res) => {
        if (res.msg === 'SUCCESS') {
          message.success(`删除成功(${this.state.selectedRowKeys.length})`);
          this.initObjectList();
        }
      })
      .catch((error) => {
        console.error(error);
        message.error('操作失败');
      });
  };

  // 检查已选择的不包含文件夹,且已选择不为空
  checkSelect = () => {
    const { selectedRows } = this.state;
    const dirRow = selectedRows.filter(item => item.isDir === true);
    return dirRow.length > 0 || selectedRows.length < 1;
  };

  // 检查当前是否有选择
  checkSelectForDelete = () => {
    return this.state.selectedRows.length < 1;
  };

  menu = () => {
    return (
      <Menu onClick={this.handleMenuClick}>
        <Menu.Item key="1" disabled={this.checkSelect()}>
          下载
        </Menu.Item>
        <Menu.Item key="2" disabled={this.checkSelectForDelete()}>
          删除
        </Menu.Item>
      </Menu>
    );
  };

  handleMenuClick = async (item) => {
    // 批量下载
    if (item.key === '1') {
      const { selectedRows } = this.state;
      const fullPaths = [];
      for (let i = 0; i < selectedRows.length; i++) {
        const record = selectedRows[i];
        const path = record.filePath === '/' ? record.fileName : `${record.filePath}/${record.fileName}`;
        fullPaths.push(path);
      }
      this.batchDownLoad(fullPaths);
      return;
    }
    // 批量删除
    if (item.key === '2') {
      this.showBatchDeleteWarning();
    }
  };

  batchDownLoad = (fullPaths) => {
    GenerateDownloadUrlApi({
      bucket: this.state.bucketName,
      objectPath: fullPaths,
    })
      .then((res) => {
        if (res.msg === 'SUCCESS') {
          const downUrls = res.data;
          downUrls.forEach((url) => {
            const elemIF = document.createElement('iframe');
            elemIF.src = url;
            elemIF.style.display = 'none';
            document.body.appendChild(elemIF);
          });
        }
      });
  };

  showBatchDeleteWarning = () => {
    const thisAlias = this;
    confirm({
      title: '批量删除',
      centered: true,
      content: (
        <div style={{ color: 'red' }}>
          批量删除对象或目录，如果包含目录，该目录下所有子对象将会被同步删除，操作不可撤销，请慎重操作!
        </div>
      ),
      okText: '确定',
      cancelText: '取消',
      onOk() {
        let { selectedRows } = thisAlias.state;
        for (let i = 0; i < selectedRows.length;) {
          const record = selectedRows[i];
          selectedRows = selectedRows.filter(k => k.id !== record.id);
        }
        thisAlias.deleteObject();
        thisAlias.setState({
          selectedRows,
        });
      },
      onCancel() {
        message.info('批量取消删除');
      },
    });
  };

  showSetObjectAclDrawer = async (record) => {
    await this.setState({
      setObjectAclVisible: true,
      currentRecord: record,
    });
  };

  detailDrawerClose = () => {
    this.setState({
      detailVisible: false,
      currentRecord: undefined,
    });
  };

  setObjectAclDrawerClose = () => {
    this.setState({
      setObjectAclVisible: false,
      currentRecord: undefined,
    });
  };

  detailDrawerShow = (record, e) => {
    e.preventDefault();
    this.setState({
      detailVisible: true,
      currentRecord: record,
    });
  };

  showDeleteConfirm = (record, e) => {
    if (e) {
      e.preventDefault();
    }
    const thisAlias = this;
    let content = <span>删除后无法恢复，确定删除吗？</span>;
    if (record.isDir) {
      content = (
        <div>
          <p style={{ fontWeight: 'bold' }}>1. 删除后无法恢复，确定删除吗？</p>
          <p style={{ fontWeight: 'bold' }}>2. 删除目录需要一定时间，请勿重复操作</p>
        </div>
      );
    }
    const fullPath = record.filePath === '/' ? `/${record.fileName}` : `${record.filePath}/${record.fileName}`;
    confirm({
      title: (
        <div>
          即将删除
          <span style={{
            color: 'red',
            margin: '0 5px',
            fontWeight: 'bold',
          }}
          >
            {fullPath}
          </span>
          请确认!
        </div>
      ),
      centered: true,
      content,
      okText: '确定',
      cancelText: '取消',
      onOk() {
        thisAlias.deleteObject(record.id);
      },
      onCancel() {
        message.info('取消删除');
      },
    });
  };

  showDrawer = () => {
    this.setState({
      visible: true,
    });
  };

  showAddFolderDrawer = () => {
    this.setState({
      addFolderVisible: true,
    });
  };

  closeDrawer = () => {
    this.setState({
      visible: false,
    });
  };

  closeAddFolderDrawer = () => {
    this.setState({
      addFolderVisible: false,
    });
  };

  goPath = async (index, e) => {
    e.preventDefault();
    const { currentPath } = this.state;
    const pathQueue = currentPath.length > 1 ? currentPath.substr(1)
      .split('/') : null;
    let path = '/';
    if (pathQueue) {
      for (let i = 0; i < index; i++) {
        if (path === '/') {
          path += pathQueue[i];
        } else {
          path += `/${pathQueue[i]}`;
        }
      }
    }
    const { pathname } = this.props.location;
    await this.setState({
      currentPath: path,
    });
    this.props.history.push(`${pathname}?path=${encodeURIComponent(path)}`);
    this.initObjectList();
  };

  authDrawerOpen = () => {
    this.setState({
      showAuthDrawerVisible: true,
    });
  };

  authDrawerClose = () => {
    this.setState({
      showAuthDrawerVisible: false,
    });
  };

  render() {
    const { tableLoading, showAuthDrawerVisible, setObjectAclVisible, objectList, selectedRowKeys, visible, addFolderVisible, currentPath, detailVisible, currentRecord, search } = this.state;
    const pathQueue = currentPath.length > 1 ? currentPath.substr(1)
      .split('/') : null;
    const rowSelection = {
      columnWidth: 60,
      selectedRowKeys,
      onChange: this.onSelectChange,
    };
    const renderFileName = (val, record) => {
      return (
        <div className="object-name">
          {
            record.isDir ? (
              <i className="icon-file-m" />
            ) : (
              <div style={{ display: 'flex' }}>
                <svg className="icon" aria-hidden="true">
                  <use xlinkHref={`#${getIconByFileName(record)}`} />
                </svg>
              </div>
            )
          }
          <span className="list-file-name" onClick={e => this.detailDrawerShow(record, e)}>{val}</span>
        </div>
      );
    };
    const moreMenu = (record) => {
      return (
        <Menu onClick={item => this.handleMoreMenuClick(record, item)}>
          <Menu.Item key="1">
            设置读写权限
          </Menu.Item>
          <Menu.Item key="2">
            下载
          </Menu.Item>
          <Menu.Item key="3">
            复制文件URL
          </Menu.Item>
          <Menu.Item key="4">
            删除
          </Menu.Item>
        </Menu>
      );
    };
    const renderOperate = (text, record) => {
      return (
        <div>
          <Button type="link" size="small" onClick={e => this.detailDrawerShow(record, e)}>详情</Button>
          {
            record.isDir ? (
              <Button type="link" size="small" onClick={e => this.showDeleteConfirm(record, e)}>删除</Button>
            ) : (
              <Dropdown overlay={moreMenu(record)} size="small">
                <Button type="link" size="small">
                  更多
                  <DownOutlined />
                </Button>
              </Dropdown>
            )
          }
        </div>
      );
    };
    return (
      <div className="file-home">
        <div className="head">
          <div className="header-line">
            <div className="left-btn-group">
              <Button type="primary"
                icon={<UploadOutlined />}
                style={{ marginRight: '10px' }}
                onClick={this.showDrawer}
              >
                上传
              </Button>
              {
                visible ? (
                  <UploadFileDrawer
                    currentPath={currentPath}
                    onClose={this.closeDrawer}
                    visible={visible}
                    onSuccess={this.initObjectList}
                  />
                ) : null
              }
              <Button icon={<FolderAddOutlined />}
                style={{ marginRight: '10px' }}
                onClick={this.showAddFolderDrawer}
              >
                新建目录
              </Button>
              {
                addFolderVisible ? (
                  <AddFolderDrawer
                    currentPath={currentPath}
                    onClose={this.closeAddFolderDrawer}
                    visible={addFolderVisible}
                    onSuccess={this.initObjectList}
                  />
                ) : null
              }
              <Button icon={<SafetyCertificateOutlined />}
                style={{ marginRight: '10px' }}
                onClick={this.authDrawerOpen}
              >
                授权
              </Button>
              {
                showAuthDrawerVisible
                  ? (
                    <PolicyListDrawer
                      onClose={this.authDrawerClose}
                      visible={showAuthDrawerVisible}
                    />
                  )
                  : null
              }
              <Dropdown overlay={this.menu}>
                <Button style={{ marginRight: '10px' }}>
                  批量操作
                  <DownOutlined />
                </Button>
              </Dropdown>

              <Button icon={<ReloadOutlined />} onClick={this.initObjectList}>刷新</Button>
            </div>

            <div className="right-operate">
              <Search
                placeholder="输入文件名前缀匹配"
                onSearch={value => this.goSearchObject(value)}
                style={{
                  width: 200,
                  marginRight: '10px',
                }}
              />
            </div>
          </div>
        </div>

        <div className="list-content">
          <div className="breadcrumb">
            <Breadcrumb separator=">">
              <Breadcrumb.Item key="root" onClick={e => this.goPath(0, e)}>
                <Button type="link">我的文件</Button>
              </Breadcrumb.Item>
              {
                pathQueue && pathQueue.length > 0 ? pathQueue.map((item, index) => {
                  if (index === pathQueue.length - 1) {
                    return (
                      <Breadcrumb.Item key={index + 1}>
                        <span style={{ padding: '0 8px' }}>{item}</span>
                      </Breadcrumb.Item>
                    );
                  }
                  return (
                    <Breadcrumb.Item key={index} onClick={e => this.goPath(index + 1, e)}>
                      <Button type="link">{item}</Button>
                    </Breadcrumb.Item>
                  );
                }) : null
              }
            </Breadcrumb>
            {
              selectedRowKeys && selectedRowKeys.length > 0 ? (
                <div className="select-count">
                  已选择：
                  <span>{`${selectedRowKeys.length}/${objectList.length}`}</span>
                </div>
              ) : null
            }
          </div>

          <div className="table">
            <Table
              rowSelection={rowSelection}
              dataSource={objectList}
              pagination={false}
              scroll={{ y: window.innerHeight - 357 }}
              rowKey="id"
              loading={tableLoading}
              onRow={(record) => {
                return {
                  onClick: (e) => {
                    this.onRowClick(record, e);
                  },
                  onDoubleClick: (e) => {
                    this.onRowDoubleClick(record, e);
                  },
                  onContextMenu: (e) => {
                    this.onRowContextMenu(record, e);
                  },
                  onMouseEnter: (e) => {
                    this.onRowMouseEnter(record, e);
                  },
                  onMouseLeave: (e) => {
                    this.onRowMouseLeave(record, e);
                  },
                };
              }}
            >
              <Table.Column ellipsis title="文件名(Object Name)" dataIndex="fileName" render={renderFileName} />
              {
                search ? (
                  <Table.Column ellipsis width={280} title="路径" dataIndex="filePath" />
                ) : null
              }
              <Table.Column width={160} title="大小" dataIndex="formattedSize" />
              <Table.Column
                width={200}
                title="上次修改时间"
                dataIndex="updateTime"
                sorter={(rowA, rowB) => rowA.createTime > rowB.createTime}
              />
              <Table.Column width={180} title="操作" render={renderOperate} align="center" />
            </Table>
            {
              currentRecord ? (
                <DetailDrawer info={currentRecord} onClose={this.detailDrawerClose} visible={detailVisible} />
              ) : null
            }
            {
              setObjectAclVisible ? (
                <SetObjectAclDrawer info={currentRecord}
                  onClose={this.setObjectAclDrawerClose}
                  onSuccess={this.initObjectList}
                  visible={setObjectAclVisible}
                />
              ) : null
            }
          </div>
        </div>
      </div>
    );
  }
}
