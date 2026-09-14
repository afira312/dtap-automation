locals {
  tags = merge(var.tags, {
    instance    = "${var.resourcePrefix}-spa"
    environment = var.environment
    location    = var.location
    managedBy   = "terraform"
    deployedBy  = "afira312\\dtap-automation"
  })
}

data "azurerm_client_config" "current" {}

resource "azurerm_resource_group" "this" {
  name     = "${var.resourcePrefix}-rg"
  location = var.location

  tags = merge(local.tags, {
    "service-name" = "${var.resourcePrefix}-rg"
  })
}

module "storage" {
  source  = "Azure/avm-res-storage-storageaccount/azurerm"
  version = "0.10.0"

  name                            = "sa${replace(replace(var.resourcePrefix, "-", ""), "_", "")}"
  parent_id                       = azurerm_resource_group.this.id
  location                        = azurerm_resource_group.this.location
  enable_telemetry                = false
  access_tier                     = "Hot"
  account_kind                    = "StorageV2"
  account_replication_type        = "LRS"
  account_sku_name                = "Standard_LRS"
  account_tier                    = "Standard"
  allow_nested_items_to_be_public = false
  public_network_access_enabled   = true
  network_rules = {
    default_action = "Allow"
  }
  containers = {
    release = {
      name          = "release"
      public_access = "None"
      role_assignments = {
        storage_blob_data_contributor = {
          role_definition_id_or_name = "Storage Blob Data Contributor"
          principal_id               = data.azurerm_client_config.current.object_id
        }
      }
    }
  }
}

module "asp" {
  source  = "Azure/avm-res-web-serverfarm/azurerm"
  version = "2.0.8"

  enable_telemetry       = false
  location               = azurerm_resource_group.this.location
  name                   = "${var.resourcePrefix}-asp"
  os_type                = "Linux"
  parent_id              = azurerm_resource_group.this.id
  sku_name               = var.asp_sku_name
  zone_balancing_enabled = var.environment == "dev" ? false : true
  worker_count           = var.environment == "dev" ? 1 : 2

  tags = merge(local.tags, {
    "service-name" = "${var.resourcePrefix}-asp"
  })
}

module "app" {
  source  = "Azure/avm-res-web-site/azurerm"
  version = "0.22.0"

  enable_telemetry              = false
  location                      = azurerm_resource_group.this.location
  name                          = "${var.resourcePrefix}-app"
  parent_id                     = azurerm_resource_group.this.id
  service_plan_resource_id      = module.asp.resource_id
  https_only                    = true
  public_network_access_enabled = var.environment == "dev" ? true : false

  site_config = {
    always_on           = false
    use_32_bit_worker   = true
    ftps_state          = "FtpsOnly"
    http2_enabled       = true
    minimum_tls_version = "1.2"
  }

  app_settings = {
    myEnvironment = var.environment
  }

  tags = merge(local.tags, {
    "service-name" = "${var.resourcePrefix}-app"
  })
}
