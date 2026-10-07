module "spa-01" {
  source = "./_modules/spa"

  environment    = var.environment
  location       = var.location
  resourcePrefix = var.resourcePrefix
  asp_sku_name   = var.asp_sku_name

  tags = var.tags
}

module "workflow" {
  source  = "Azure/avm-res-web-site/azurerm"
  version = "0.22.0"

  enable_telemetry              = false
  location                      = var.location
  name                          = "${var.resourcePrefix}-workflow"
  parent_id                     = module.spa-01.resource_group_id
  service_plan_resource_id      = module.spa-01.asp_id
  https_only                    = true
  public_network_access_enabled = true

  site_config = {
    always_on           = false
    use_32_bit_worker   = true
    ftps_state          = "FtpsOnly"
    http2_enabled       = true
    minimum_tls_version = "1.2"
    app_command_line    = "python server.py 8000"
    application_stack = {
      python = {
        python_version = "3.12"
      }
    }
  }

  app_settings = {
    myEnvironment                  = var.environment
    WEBSITES_PORT                  = "8000"
    PYTHONUNBUFFERED               = "1"
    SCM_DO_BUILD_DURING_DEPLOYMENT = "true"
  }

  tags = merge(var.tags, {
    instance       = "${var.resourcePrefix}-spa"
    environment    = var.environment
    location       = var.location
    managedBy      = "terraform"
    deployedBy     = "afira312\\dtap-automation"
    "service-name" = "${var.resourcePrefix}-app"
  })
}
